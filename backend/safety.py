"""Input/output safety: block secret fishing; scrub leaks; block secret-file reads.

Design (Codex/GPT style): no nagging safety prompts in the chat. Guards are silent
tool/input/output filters. Connecting via SSH and reading ~/.ssh/config Host lines
are allowed; dumping private key / .env / API key contents is not.
"""

from __future__ import annotations

import re
from typing import Any

from backend.repo_write_guard import (
    SHELL_TOOL_NAMES,
    WRITE_TOOL_NAMES,
    args_paths,
    cmd_from_args,
    normalize_tool_name,
)

# Ask to *reveal* secret values — not operational talk about keys / SSH.
_SECRET_ASK_RE = re.compile(
    r"(?:"
    r"(?:密码|口令|password|passwd|api[\s_-]?key|secret|私钥|凭证|token|凭据|API\s*密钥)"
    r".{0,24}"
    r"(?:是什么|是多少|告诉我|发给我|输出|打印|复述|明文|全文|内容)"
    r"|"
    r"(?:是什么|告诉我|发给我|输出|打印|复述|明文)"
    r".{0,24}"
    r"(?:密码|口令|password|passwd|api[\s_-]?key|secret|私钥|凭证|token|凭据|API\s*密钥)"
    r"|"
    # 「密钥」 alone is common in SSH ops; only block clear reveal intent.
    r"密钥.{0,16}(?:是什么|内容|正文|明文|告诉我|发给我|输出|打印|复述)"
    r"|"
    r"(?:把|将)?.{0,8}密钥.{0,12}(?:打出来|发我|发给我|贴出来)"
    r")",
    re.I | re.S,
)

# Operational intents that must never trip secret-ask (connect, pick key file, etc.).
_SECRET_OPS_ALLOW_RE = re.compile(
    r"(?:"
    r"\bssh\b|SSH|HostName|IdentityFile|known_hosts"
    r"|(?:连接|连上|连一下|登录|登陆).{0,24}(?:服务器|主机|机器|ssh|SSH|\d{1,3})"
    r"|(?:用|使用).{0,8}密钥.{0,20}(?:连|登录|登陆|ssh|SSH)"
    r"|密钥(?:文件|路径|名|后缀|哪个|哪一个)"
    r"|(?:哪个|哪一个).{0,12}密钥"
    r"|~/?\.ssh|\.ssh[/\\]"
    r")",
    re.I | re.S,
)

_ILLEGAL_ASK_RE = re.compile(
    r"(?:"
    r"(?:如何|怎么|怎样).{0,12}(?:制作|制造|合成).{0,12}(?:炸弹|爆炸物|毒品|冰毒|枪支|武器)"
    r"|"
    r"(?:入侵|攻击|破解|撞库|ddos).{0,16}(?:系统|服务器|网站|数据库|账号)"
    r"|"
    r"(?:儿童色情|未成年).{0,12}(?:色情|性交|裸)"
    r"|"
    r"(?:绕过|规避).{0,8}(?:法律|监管|风控)"
    r")",
    re.I | re.S,
)

# Private keys / .env / credentials — NOT config, known_hosts, or *.pub.
_SENSITIVE_PATH_RE = re.compile(
    r"(?:"
    r"(?:^|[/\\])\.env(?:\.[A-Za-z0-9._-]+)?$"
    r"|(?:^|[/\\])(?:credentials|secrets?)(?:\.[A-Za-z0-9._-]+)?$"
    r"|\.pem$"
    r"|(?:^|[/\\])id_(?:rsa|ed25519|ecdsa|dsa)$"
    r"|service[_-]?account.*\.json$"
    # Any non-pub file under .ssh except config / known_hosts
    r"|(?:^|[/\\])\.ssh[/\\](?!(?:config|known_hosts(?:\.old)?)$)(?!.*\.pub$)[^/\\]+$"
    r")",
    re.I,
)

_SHELL_READER_RE = re.compile(
    r"\b(?:cat|less|more|head|tail|bat|type|Get-Content|gc)\b",
    re.I,
)

# Targets that mean "dump secret file contents" (not ssh -i path, not config).
_SHELL_SECRET_TARGET_RE = re.compile(
    r"(?:"
    r"\.env\b"
    r"|credentials"
    r"|\.pem\b"
    r"|(?:^|[/\\\"'\\s])id_(?:rsa|ed25519|ecdsa|dsa)\b"
    r"|[/\\]\.ssh[/\\](?!(?:config|known_hosts(?:\.old)?)\b)(?![^\s\"']*\.pub\b)[^\s\"']+"
    r")",
    re.I,
)

_SHELL_ENV_DUMP_RE = re.compile(
    r"(?:"
    r"\b(?:grep|rg|awk|sed|Select-String)\b[^\n|;]*(?:\.env\b|password|api[_-]?key|CURSOR_API_KEY)"
    r"|"
    r"open\s*\(\s*['\"][^'\"]*(?:\.env)['\"]"
    r"|"
    r"\bprintenv\b"
    r"|"
    r"\becho\s+\$[A-Z_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD)"
    # Bare `env` / `env |` — not PowerShell `$env:VAR` and not `ENV_FOO=`.
    r"|"
    r"(?<!\$)\benv\b(?!:)(?!\s+\w+=)"
    r")",
    re.I,
)

_READ_TOOL_NAMES = {
    "read",
    "readfile",
    "readfiles",
    "cat",
    "grep",
    "rg",
    "ripgrep",
    "search",
    "glob",
    "find",
    "semsearch",
    "semanticsearch",
}

# Shape detectors used both for redaction and for “did output leak?”
_SECRET_SHAPE_RES: list[re.Pattern[str]] = [
    re.compile(r"\bcrsr_[A-Za-z0-9]{16,}\b"),
    re.compile(r"\bsk-[A-Za-z0-9]{16,}\b"),
    re.compile(r"\bcursor_[A-Za-z0-9]{16,}\b"),
    re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b"),
]

_REDACT_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (_SECRET_SHAPE_RES[0], "[REDACTED_API_KEY]"),
    (_SECRET_SHAPE_RES[1], "[REDACTED_API_KEY]"),
    (_SECRET_SHAPE_RES[2], "[REDACTED_API_KEY]"),
    (_SECRET_SHAPE_RES[3], "[REDACTED_JWT]"),
]

# key=value / 表格形式 — also used by text_has_secret (detect before soft-redact)
_SECRET_ASSIGNMENT_RES: list[re.Pattern[str]] = [
    re.compile(
        r"(?i)((?:api[_-]?key|password|passwd|secret|token|access[_-]?key|CURSOR_API_KEY)\s*[=:：]\s*)(['\"]?)([^\s'\"|,}{]+)\2"
    ),
    re.compile(r"(?i)((?:密码|口令|私钥|凭证)\s*[=:：]\s*)([^\s|，,；;]+)"),
    re.compile(
        r"(?i)((?:password|passwd|密码|口令)\s*[|｜]\s*)(`?)([A-Za-z0-9!@#$%^&*._-]{6,64})\2"
    ),
]

_REDACT_PATTERNS += [
    (_SECRET_ASSIGNMENT_RES[0], r"\1\2[REDACTED]\2"),
    (_SECRET_ASSIGNMENT_RES[1], r"\1[REDACTED]"),
    (_SECRET_ASSIGNMENT_RES[2], r"\1\2[REDACTED]\2"),
]

# User/agent-facing notices: short, silent — no policy essays about what *is* allowed.
INPUT_BLOCK_SECRET = "我不能提供密码、API Key 或私钥内容。"
OUTPUT_BLOCK_SECRET = "回复中含敏感内容，已省略。"
INPUT_BLOCK_ILLEGAL = "该请求涉及违法或高危用途，助手不会提供相关协助。"
SENSITIVE_READ_BLOCK = "无法读取该敏感文件。"


# Exact secrets from process settings (api_key); never log these.
_KNOWN_SECRETS: list[str] = []
_SAFETY_ENABLED = True


def set_safety_enabled(enabled: bool) -> None:
    """Toggle bidirectional secret guards (input block, output scrub, sensitive reads)."""
    global _SAFETY_ENABLED
    _SAFETY_ENABLED = bool(enabled)
    if not _SAFETY_ENABLED:
        _KNOWN_SECRETS.clear()


def set_known_secrets(*values: str) -> None:
    """Register live secrets so output scrubbing catches the exact token."""
    if not _SAFETY_ENABLED:
        return
    global _KNOWN_SECRETS
    seen: set[str] = set()
    out: list[str] = []
    for raw in values:
        s = (raw or "").strip()
        if len(s) < 8 or s in seen:
            continue
        seen.add(s)
        out.append(s)
    _KNOWN_SECRETS = out


def input_block_reason(text: str) -> str | None:
    if not _SAFETY_ENABLED:
        return None
    msg = (text or "").strip()
    if not msg:
        return None
    if _ILLEGAL_ASK_RE.search(msg):
        return INPUT_BLOCK_ILLEGAL
    if _SECRET_OPS_ALLOW_RE.search(msg):
        return None
    if _SECRET_ASK_RE.search(msg):
        return INPUT_BLOCK_SECRET
    return None


def text_has_secret(text: str) -> bool:
    """True if text contains a known secret or a secret-shaped token / assignment."""
    if not _SAFETY_ENABLED or not text:
        return False
    for secret in _KNOWN_SECRETS:
        if secret and secret in text:
            return True
    for pat in _SECRET_SHAPE_RES:
        if pat.search(text):
            return True
    for pat in _SECRET_ASSIGNMENT_RES:
        if pat.search(text):
            return True
    return False


def is_sensitive_path(path: str) -> bool:
    p = str(path or "").replace("\\", "/")
    return bool(_SENSITIVE_PATH_RE.search(p))


def _shell_reads_secret(cmd: str) -> bool:
    """True only when the command would dump secret file / env contents."""
    text = cmd or ""
    if _SHELL_ENV_DUMP_RE.search(text):
        # Allow ssh even if the line somehow mentions env-looking tokens elsewhere.
        if re.search(r"(?i)\bssh\b", text) and not _SHELL_READER_RE.search(text):
            return False
        return True
    if _SHELL_READER_RE.search(text) and _SHELL_SECRET_TARGET_RE.search(text):
        return True
    return False


# Destructive / irreversible shell — pause for UI confirm (not a hard block).
_SHELL_APPROVAL_RE = re.compile(
    r"(?:"
    r"\brm\s+(?:-[^\s]*\s+)*-[^\s]*r|\brm\s+(?:-[^\s]*\s+)*-[^\s]*f\b|\brm\s+-rf\b|\brm\s+-fr\b"
    r"|\brmdir\b|\bdel\s+/[sSqQfF]"
    r"|\bRemove-Item\b[^\n|;]*-(?:Recurse|Force)\b"
    r"|\bgit\s+push\b[^\n|;]*--force|\bgit\s+push\b[^\n|;]*\s-f\b"
    r"|\bgit\s+reset\s+--hard\b|\bgit\s+clean\s+[^\n|;]*-f"
    r"|\bdd\s+if=|\bmkfs\b|\bformat\s+[A-Za-z]:"
    r"|\bchmod\s+-R\s+777\b|\bchown\s+-R\b"
    r"|>\s*(?:~?/)?\.env\b|>>\s*(?:~?/)?\.env\b"
    r")",
    re.I,
)


def shell_approval_reason(cmd: str) -> str | None:
    """If command looks destructive, return a short reason for UI confirm."""
    text = (cmd or "").strip()
    if not text:
        return None
    if not _SHELL_APPROVAL_RE.search(text):
        return None
    return "该命令可能造成不可逆破坏（删除/强推/硬重置等），需确认后执行。"


def sensitive_tool_block_reason(name: str, args) -> str | None:
    """Block tools that would read secret-bearing files or dump env secrets."""
    if not _SAFETY_ENABLED:
        return None
    norm = normalize_tool_name(name)
    # write / strreplace / delete: agent sometimes dumps secrets into .env etc.
    if norm in _READ_TOOL_NAMES or norm in WRITE_TOOL_NAMES or norm == "write":
        for path in args_paths(args):
            if is_sensitive_path(path):
                return SENSITIVE_READ_BLOCK
        if isinstance(args, dict):
            # glob_pattern / pattern cover Grep/Glob targeting sensitive names
            for key in ("glob_pattern", "pattern"):
                val = args.get(key)
                if isinstance(val, str) and is_sensitive_path(val):
                    return SENSITIVE_READ_BLOCK
    if norm in SHELL_TOOL_NAMES:
        cmd = cmd_from_args(args)
        if cmd and _shell_reads_secret(cmd):
            return SENSITIVE_READ_BLOCK
    return None


def redact_secrets(text: str) -> str:
    if not _SAFETY_ENABLED or not text:
        return text
    out = text
    for secret in _KNOWN_SECRETS:
        if secret and secret in out:
            out = out.replace(secret, "[REDACTED_API_KEY]")
    for pattern, repl in _REDACT_PATTERNS:
        out = pattern.sub(repl, out)
    return out


def _redact_value(value: Any) -> Any:
    if isinstance(value, str):
        return redact_secrets(value)
    if isinstance(value, dict):
        return {k: _redact_value(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_redact_value(v) for v in value]
    return value


def sanitize_event(event: dict) -> dict:
    """Scrub secrets from SSE events. Text/thinking that leaked → replace with notice."""
    if not _SAFETY_ENABLED or not isinstance(event, dict):
        return event
    t = event.get("type")
    if t in {"text", "thinking", "summary"}:
        content = event.get("content")
        if isinstance(content, str) and text_has_secret(content):
            out = dict(event)
            out["content"] = OUTPUT_BLOCK_SECRET
            return out
    if t == "tool_call":
        # Tool payloads can carry file bodies; scrub every string field.
        scrubbed = _redact_value(event)
        # If result still looked secret-shaped before scrub, surface notice in result.
        raw_result = event.get("result")
        if isinstance(raw_result, str) and text_has_secret(raw_result):
            scrubbed["result"] = OUTPUT_BLOCK_SECRET
            if "result_json" in scrubbed:
                scrubbed["result_json"] = OUTPUT_BLOCK_SECRET
        return scrubbed
    if t == "done":
        # Match send()/scrub_reply: secret-bearing terminal fields → hard block, not soft redact.
        out = dict(event)
        for key in ("result", "error", "content"):
            val = out.get(key)
            if isinstance(val, str):
                out[key] = scrub_reply(val)
        return _redact_value(out)
    return _redact_value(event)


def scrub_reply(text: str) -> str:
    """Outbound assistant reply: intercept secret dumps, else redact leftovers."""
    if not _SAFETY_ENABLED or not text:
        return text
    if text_has_secret(text):
        return OUTPUT_BLOCK_SECRET
    return redact_secrets(text)


def policy_prefix(session) -> str:
    """Never inject safety prose into the user message (Codex/GPT style)."""
    return ""
