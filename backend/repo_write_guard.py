"""Repo write policy: block mutating tools/shell when allow_repo_write is false."""

from __future__ import annotations

import re

WRITE_TOOL_NAMES = {
  "write",
  "strreplace",
  "delete",
  "editnotebook",
  "applypatch",
  "searchreplace",
  "edit",
  "writefile",
  "deletefile",
  "notebookedit",
  "multiedit",
}
SHELL_TOOL_NAMES = {"shell", "bash", "terminal", "runterminalcmd", "exec"}
UPLOAD_DIR = ".ai-agent-uploads"
REPO_WRITE_BLOCK_MSG = (
  "当前配置禁止修改仓库文件（agent.allow_repo_write=false）。"
  "只读查询/分析可以继续；若确需改代码，请在 config.yaml 将 allow_repo_write 设为 true 后重启服务。"
)

# ponytail: 启发式拦写；漏网靠 prompt。真沙箱要等 SDK SandboxOptions 支持只读。
_SHELL_WRITE_VERB_RE = re.compile(
  r"(?:\brm\b|\bmv\b|\bcp\b|\btee\b|\btruncate\b|\bchmod\b|\bchown\b|\btouch\b|"
  r"\bmkdir\b|\bmktemp\b|\bsed\s+-i\b|\bperl\s+-i\b|"
  r"\bgit\s+(?:add|commit|checkout|reset|clean|push|rebase|merge|stash|branch)\b)",
  re.I,
)
_SHELL_REDIRECT_RE = re.compile(
  r"(?:(?:^|[|;]\s*)(?:cat|printf|echo)\b[^\"']*>|(?:^|[^|>=])>{1,2}\s*[^\s|&;]+)",
  re.I,
)
_SHELL_HARMLESS_REDIRECT_RE = re.compile(
  r"(?:(?:\d*)>|&>)\s*/dev/null|\d*>&\d+",
  re.I,
)
_SHELL_SCRIPT_PAYLOAD_RE = re.compile(
  r"(?:"
  r"\bpython3?(?:\.\d+)*(?:\s+-[^\s]*)*\s+-c\s+(?:'(?:\\.|[^'\\])*'|\"(?:\\.|[^\"\\])*\")"
  r"|"
  r"\b(?:python3?(?:\.\d+)*|bash|sh)\b[^|;&\n]*<<-?\s*(['\"]?)(\w+)\1"
  r"(?:\n.*?\n\2\b|[\s\S]*)"
  r")",
  re.I | re.S,
)


def normalize_tool_name(name: str) -> str:
  return re.sub(r"[^a-z0-9]", "", (name or "").lower())


def path_is_upload_only(path: str) -> bool:
  p = str(path or "").replace("\\", "/")
  while p.startswith("./"):
    p = p[2:]
  p = p.lstrip("/")
  return p == UPLOAD_DIR or p.startswith(UPLOAD_DIR + "/")


def args_paths(args) -> list[str]:
  if not isinstance(args, dict):
    return []
  paths: list[str] = []
  for key in ("path", "file", "target_file", "filename", "target_notebook", "notebook_path"):
    val = args.get(key)
    if isinstance(val, str) and val.strip():
      paths.append(val.strip())
  for key in ("paths", "files"):
    val = args.get(key)
    if isinstance(val, list):
      paths.extend(str(x).strip() for x in val if str(x).strip())
  return paths


def _strip_shell_quotes(cmd: str) -> str:
  return re.sub(r"'(?:\\.|[^'\\])*'|\"(?:\\.|[^\"\\])*\"", " ", cmd or "")


def _strip_shell_script_payloads(cmd: str) -> str:
  return _SHELL_SCRIPT_PAYLOAD_RE.sub(" ", cmd or "")


def shell_looks_like_write(cmd: str) -> bool:
  if not cmd:
    return False
  scrubbed = _strip_shell_script_payloads(cmd)
  if _SHELL_WRITE_VERB_RE.search(scrubbed):
    return True
  scrubbed = _SHELL_HARMLESS_REDIRECT_RE.sub(" ", scrubbed)
  return bool(_SHELL_REDIRECT_RE.search(_strip_shell_quotes(scrubbed)))


def _cmd_from_args(args) -> str:
  if isinstance(args, dict):
    for key in ("command", "cmd"):
      val = args.get(key)
      if isinstance(val, str) and val.strip():
        return val.strip()
    return ""
  if isinstance(args, str):
    return args
  return ""


def repo_write_block_reason(settings: dict, name: str, args) -> str | None:
  if settings.get("allow_repo_write", True):
    return None
  norm = normalize_tool_name(name)
  if (
    norm in WRITE_TOOL_NAMES
    or ("write" in norm and "read" not in norm)
    or norm.endswith("edit")
    or "strreplace" in norm
    or "delete" in norm
  ):
    paths = args_paths(args)
    if paths and all(path_is_upload_only(p) for p in paths):
      return None
    detail = f"「{name}」"
    if paths:
      detail += f"（目标: {', '.join(paths[:3])}）"
    return f"{REPO_WRITE_BLOCK_MSG} 拦截工具: {detail}"
  if norm in SHELL_TOOL_NAMES:
    cmd = _cmd_from_args(args)
    if shell_looks_like_write(cmd):
      preview = " ".join(cmd.split())
      if len(preview) > 80:
        preview = preview[:80] + "…"
      return f"{REPO_WRITE_BLOCK_MSG} 拦截 Shell: `{preview}`"
  return None


def identity_prefix(session, settings: dict) -> str:
  if getattr(session, "identity_injected", False) or settings.get("allow_repo_write", True):
    return ""
  session.identity_injected = True
  return (
    "【只读模式】禁止修改本仓库任何文件：不要使用 Write / StrReplace / Delete / "
    "EditNotebook，也不要用 Shell 做 rm/mv/tee/重定向写文件/git 写操作。"
    "只允许 Read / Grep / Glob / 只读 Shell。"
    "禁止读取 .env、credentials、私钥等含密钥文件。"
    f"上传暂存目录 {UPLOAD_DIR}/ 除外。用户若要求改代码，请说明需管理员打开 "
    "agent.allow_repo_write，并给出建议改动说明，不要自行落盘。\n\n"
  )
