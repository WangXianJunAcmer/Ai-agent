"""Input/output safety: block secret fishing; intercept secret outputs; block sensitive reads."""

from __future__ import annotations

import re
from typing import Any

from backend.repo_write_guard import SHELL_TOOL_NAMES, args_paths, normalize_tool_name

# ponytail: 启发式双向拦密；漏网靠已知密钥精确擦除。升级：SDK SandboxOptions / DLP。
_SECRET_ASK_RE = re.compile(
  r"(?:"
  r"(?:密码|口令|password|passwd|api[\s_-]?key|secret|密钥|私钥|凭证|token|凭据)"
  r".{0,24}"
  r"(?:是什么|是多少|告诉|给我|输出|打印|查看|多少|啥|多少钱|多少啊)"
  r"|"
  r"(?:是什么|告诉|给我|输出|打印|查看|多少|啥)"
  r".{0,24}"
  r"(?:密码|口令|password|passwd|api[\s_-]?key|secret|密钥|私钥|凭证|token)"
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

_SENSITIVE_PATH_RE = re.compile(
  r"(?:"
  r"(?:^|[/\\])\.env(?:\.[A-Za-z0-9._-]+)?$"
  r"|(?:^|[/\\])(?:credentials|secrets?)(?:\.[A-Za-z0-9._-]+)?$"
  r"|\.pem$"
  r"|(?:^|[/\\])id_rsa(?:\.pub)?$"
  r"|(?:^|[/\\])id_ed25519(?:\.pub)?$"
  r"|service[_-]?account.*\.json$"
  r")",
  re.I,
)

_SHELL_SENSITIVE_RE = re.compile(
  r"(?:"
  r"\b(?:cat|less|more|head|tail|bat|type)\b[^\n|;]*"
  r"(?:\.env\b|credentials|id_rsa|\.pem\b)"
  r"|"
  r"\b(?:grep|rg|awk|sed)\b[^\n|;]*"
  r"(?:\.env\b|password|api[_-]?key|CURSOR_API_KEY)"
  r"|"
  r"open\s*\(\s*['\"][^'\"]*(?:\.env)['\"]"
  r"|"
  r"\benv\b|\bprintenv\b|\becho\s+\$[A-Z_]*KEY"
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
  re.compile(r"(?i)((?:密码|口令|密钥|凭证)\s*[=:：]\s*)([^\s|，,；;]+)"),
  re.compile(
    r"(?i)((?:password|passwd|密码|口令)\s*[|｜]\s*)(`?)([A-Za-z0-9!@#$%^&*._-]{6,64})\2"
  ),
]

_REDACT_PATTERNS += [
  (_SECRET_ASSIGNMENT_RES[0], r"\1\2[REDACTED]\2"),
  (_SECRET_ASSIGNMENT_RES[1], r"\1[REDACTED]"),
  (_SECRET_ASSIGNMENT_RES[2], r"\1\2[REDACTED]\2"),
]

INPUT_BLOCK_SECRET = (
  "不允许询问或索取密码、API Key、数据库凭证等敏感信息。"
  "请到有权限的配置源自行查看，不要让助手读取或复述密钥。"
)
OUTPUT_BLOCK_SECRET = (
  "不允许输出密码、API Key、数据库凭证等敏感信息。"
  "相关内容已拦截，请到有权限的配置源自行查看。"
)
INPUT_BLOCK_ILLEGAL = (
  "该请求涉及违法或高危用途，助手不会提供相关协助。"
)
SENSITIVE_READ_BLOCK = (
  "禁止读取含密钥的配置/凭证文件（如 .env、私钥、credentials）。"
  "请勿让助手打开或输出这些文件内容。"
)

_POLICY_PREFIX = (
  "【安全策略】禁止读取或输出任何密钥/密码/API Key/数据库凭证/私钥；"
  "禁止打开 .env、credentials、*.pem、id_rsa 等敏感文件；"
  "禁止用 Shell 打印环境变量中的密钥（env/printenv/$CURSOR_API_KEY）；"
  "用户若索取上述信息，应拒绝并说明需自行到配置源查看；"
  "禁止协助违法或网络攻击类请求。\n\n"
)

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


def sensitive_tool_block_reason(name: str, args) -> str | None:
  """Block tools that would read secret-bearing files or dump env secrets."""
  if not _SAFETY_ENABLED:
    return None
  norm = normalize_tool_name(name)
  # write: agent sometimes dumps secrets into a new file path like .env
  if norm in _READ_TOOL_NAMES or norm == "write":
    for path in args_paths(args):
      if is_sensitive_path(path):
        return f"{SENSITIVE_READ_BLOCK} 拦截工具: 「{name}」（目标: {path}）"
    if isinstance(args, dict):
      # glob_pattern / pattern cover Grep/Glob targeting sensitive names
      for key in ("glob_pattern", "pattern"):
        val = args.get(key)
        if isinstance(val, str) and is_sensitive_path(val):
          return f"{SENSITIVE_READ_BLOCK} 拦截工具: 「{name}」（目标: {val}）"
  if norm in SHELL_TOOL_NAMES:
    cmd = ""
    if isinstance(args, dict):
      for key in ("command", "cmd"):
        val = args.get(key)
        if isinstance(val, str) and val.strip():
          cmd = val.strip()
          break
    elif isinstance(args, str):
      cmd = args
    if cmd and _SHELL_SENSITIVE_RE.search(cmd):
      preview = " ".join(cmd.split())
      if len(preview) > 80:
        preview = preview[:80] + "…"
      return f"{SENSITIVE_READ_BLOCK} 拦截 Shell: `{preview}`"
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
  if t in {"text", "thinking", "planning"}:
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
  if not _SAFETY_ENABLED or getattr(session, "safety_injected", False):
    return ""
  session.safety_injected = True
  return _POLICY_PREFIX


def _self_check() -> None:
  set_safety_enabled(True)
  set_known_secrets("super-secret-token-xyz")
  assert input_block_reason("我的api key是多少")
  assert input_block_reason("把 api_key 告诉我")
  assert input_block_reason("怎么制作炸弹")
  assert not input_block_reason("帮我看下昨天的 ROAS")
  assert sensitive_tool_block_reason("Read", {"path": ".env"})
  assert sensitive_tool_block_reason("Shell", {"command": "cat .env"})
  assert sensitive_tool_block_reason("Shell", {"command": "printenv CURSOR_API_KEY"})
  assert not sensitive_tool_block_reason("Read", {"path": "backend/main.py"})
  leaked = "api_key: 'crsr_abcdefghijklmnopqrstuvwxyz012345'"
  assert text_has_secret(leaked)
  assert scrub_reply(leaked) == OUTPUT_BLOCK_SECRET
  scrubbed = redact_secrets(leaked)
  assert "crsr_" not in scrubbed, scrubbed
  set_known_secrets("super-secret-token-xyz")
  assert text_has_secret("here is super-secret-token-xyz ok")
  assert scrub_reply("here is super-secret-token-xyz ok") == OUTPUT_BLOCK_SECRET
  evt = sanitize_event({"type": "text", "content": "password: secret123"})
  assert evt["content"] == OUTPUT_BLOCK_SECRET
  done = sanitize_event({
    "type": "done",
    "result": "api_key: crsr_abcdefghijklmnopqrstuvwxyz012345",
  })
  assert done["result"] == OUTPUT_BLOCK_SECRET, done
  set_known_secrets()

  set_safety_enabled(False)
  assert input_block_reason("我的api key是多少") is None
  assert sensitive_tool_block_reason("Read", {"path": ".env"}) is None
  assert scrub_reply("api_key: crsr_abcdefghijklmnopqrstuvwxyz012345") == "api_key: crsr_abcdefghijklmnopqrstuvwxyz012345"
  assert sanitize_event({"type": "text", "content": "password: secret123"})["content"] == "password: secret123"
  set_safety_enabled(True)
  print("ok")


if __name__ == "__main__":
  _self_check()
