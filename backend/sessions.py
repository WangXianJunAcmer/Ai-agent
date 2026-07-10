"""Per-session Cursor agents backed by one shared AsyncClient."""

from __future__ import annotations

import asyncio
import base64
import json
import re
import uuid
from contextlib import AsyncExitStack
from dataclasses import dataclass, field
from pathlib import Path
from typing import AsyncIterator

from cursor_sdk import (
  AsyncClient,
  CloudAgentOptions,
  CloudRepository,
  CursorAgentError,
  LocalAgentOptions,
  SDKImage,
  SendOptions,
  UserMessage,
)

from backend.model_catalog import model_display_name, normalize_model_id

_TERMINAL_RUN_STATUSES = frozenset({"finished", "error", "cancelled", "expired"})


@dataclass
class Session:
    session_id: str
    agent: object
    model: str
    model_key: str = ""
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    active_run: object | None = None


class SessionManager:
  def __init__(self, settings: dict):
    self.settings = settings
    self._stack = AsyncExitStack()
    self._client: AsyncClient | None = None
    self._sessions: dict[str, Session] = {}
    self._started = False

  async def start(self) -> None:
    if self._started:
      return
    host_root = str(self.settings["host_root"])
    self._client = await self._stack.enter_async_context(
      await AsyncClient.launch_bridge(workspace=host_root)
    )
    self._started = True

  async def stop(self) -> None:
    for session in list(self._sessions.values()):
      await self._close_agent(session.agent)
    self._sessions.clear()
    # Bridge may already be gone on Ctrl+C / reload; don't fail app shutdown.
    try:
      await self._stack.aclose()
    except Exception:
      pass
    self._client = None
    self._started = False

  async def get_or_create(self, session_id: str | None, model: str | dict | None = None) -> Session:
    await self.start()
    if isinstance(model, dict):
      selected_model = str(model.get("id") or self.settings["model"])
      model_selection = model
    else:
      selected_model = model or self.settings["model"]
      model_selection = model or self.settings["model"]
    model_key = self._model_key(model_selection)
    if session_id and session_id in self._sessions:
      session = self._sessions[session_id]
      if session.model_key == model_key:
        return session
      await self._close_agent(session.agent)
      del self._sessions[session_id]

    sid = session_id or uuid.uuid4().hex
    assert self._client is not None
    # Manage close() ourselves — stacking every agent on AsyncExitStack leaks on model switch.
    agent = await self._client.agents.create(**self._agent_options(model_selection))
    session = Session(session_id=sid, agent=agent, model=selected_model, model_key=model_key)
    self._sessions[sid] = session
    return session

  @staticmethod
  def _model_key(model: str | dict | None) -> str:
    if isinstance(model, dict):
      return json.dumps(
        {"id": model.get("id"), "params": model.get("params") or []},
        sort_keys=True,
        ensure_ascii=False,
      )
    return str(model or "")

  def _agent_options(self, model: str | dict):
    s = self.settings
    model_id = model.get("id") if isinstance(model, dict) else model
    label = model_id or s["model"]
    opts: dict = {
      "model": model,
      "api_key": s["api_key"],
      "name": f"Ai-agent ({label})",
    }
    if s["runtime"] == "cloud":
      if not s["cloud_repo_url"]:
        raise RuntimeError("agent.runtime is cloud but agent.cloud.repo_url is empty")
      opts["cloud"] = CloudAgentOptions(
        repos=[CloudRepository(url=s["cloud_repo_url"], starting_ref=s["cloud_starting_ref"])],
        auto_create_pr=s["cloud_auto_create_pr"],
      )
    else:
      opts["local"] = LocalAgentOptions(cwd=str(s["host_root"]))
    return opts

  async def _close_agent(self, agent) -> None:
    close = getattr(agent, "close", None)
    if not close:
      return
    try:
      await close()
    except Exception:
      # Bridge already down during process exit / hot reload.
      pass

  async def _cancel_run(self, run) -> None:
    if run is None:
      return
    try:
      status = getattr(run, "status", None) or "running"
      if status in _TERMINAL_RUN_STATUSES:
        return
      cancel = getattr(run, "cancel", None)
      if cancel:
        await cancel()
    except Exception:
      pass

  async def _cancel_session_run(self, session: Session) -> None:
    run = session.active_run
    if run is None:
      return
    await self._cancel_run(run)
    session.active_run = None

  def _stringify(self, value) -> str:
    if value is None:
      return ""
    if isinstance(value, str):
      return value
    try:
      return json.dumps(value, ensure_ascii=False, indent=2)
    except Exception:
      return str(value)

  def _jsonable(self, value):
    if value is None or isinstance(value, (str, int, float, bool)):
      return value
    if isinstance(value, dict):
      return {str(k): self._jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
      return [self._jsonable(item) for item in value]
    try:
      json.dumps(value)
      return value
    except Exception:
      return str(value)

  def _collect_paths(self, value) -> list[str]:
    paths: list[str] = []

    def visit(item) -> None:
      if isinstance(item, dict):
        for key, nested in item.items():
          lowered = str(key).lower()
          if lowered in {
            "path", "paths", "file", "files", "target_file", "target_notebook",
            "working_directory", "cwd", "glob_pattern", "pattern",
          }:
            if isinstance(nested, str):
              paths.append(nested)
            elif isinstance(nested, (list, tuple)):
              for entry in nested:
                if isinstance(entry, str):
                  paths.append(entry)
          visit(nested)
      elif isinstance(item, (list, tuple)):
        for nested in item:
          visit(nested)

    visit(value)
    seen = set()
    result = []
    for path in paths:
      if path and path not in seen:
        seen.add(path)
        result.append(path)
    return result[:6]

  def _first_str(self, value, *keys) -> str:
    if not isinstance(value, dict):
      return ""
    for key in keys:
      nested = value.get(key)
      if isinstance(nested, str) and nested.strip():
        return nested.strip()
    return ""

  def _unwrap_tool_payload(self, value):
    """SDK puts tool info under update.tool_call, often as {readToolCall: {...}} or {type, args}."""
    if not isinstance(value, dict) or not value:
      return value
    if any(k in value for k in ("name", "toolName", "tool_name", "type", "args", "arguments", "input", "result", "output")):
      return value
    if len(value) == 1:
      key, only = next(iter(value.items()))
      if isinstance(only, dict):
        if "type" not in only and str(key).endswith("ToolCall"):
          tool_type = str(key)[: -len("ToolCall")]
          if tool_type:
            only = {**only, "type": tool_type[0].lower() + tool_type[1:]}
        return only
    for key, nested in value.items():
      if isinstance(nested, dict) and key.lower().endswith(("toolcall", "tool_call", "call")):
        return nested
    return value

  def _tool_name_from_payload(self, tool_call, payload) -> str:
    for source in (tool_call, payload):
      if not isinstance(source, dict):
        continue
      for key in ("type", "name", "toolName", "tool_name", "tool", "functionName", "function_name"):
        val = source.get(key)
        if isinstance(val, str) and val.strip():
          return val.strip()
    if isinstance(tool_call, dict):
      for key in tool_call:
        lowered = str(key)
        if lowered.endswith("ToolCall"):
          stem = lowered[: -len("ToolCall")]
          return stem[0].lower() + stem[1:] if stem else "tool"
        if lowered.endswith("_tool_call"):
          return lowered[: -len("_tool_call")]
        if lowered.endswith("Tool"):
          stem = lowered[: -len("Tool")]
          return stem[0].lower() + stem[1:] if stem else "tool"
    return "tool"

  def _tool_args_from_payload(self, payload):
    if not isinstance(payload, dict):
      return payload
    for key in ("args", "arguments", "input", "params", "parameters"):
      if key in payload and payload[key] is not None:
        return payload[key]
    # common shell / read shapes live at top level
    keep = {}
    for key in (
      "command", "cmd", "path", "paths", "file", "files", "target_file",
      "glob_pattern", "pattern", "query", "search_term", "url", "description",
      "working_directory", "cwd", "old_string", "new_string", "patch",
    ):
      if key in payload:
        keep[key] = payload[key]
    return keep or payload

  def _tool_result_from_payload(self, payload):
    if not isinstance(payload, dict):
      return payload
    for key in ("result", "output", "response", "content", "stdout"):
      if key in payload and payload[key] is not None:
        return payload[key]
    return None

  def _extract_tool_fields(self, update) -> tuple[str, object, object]:
    tool_call = getattr(update, "tool_call", None)
    if tool_call is None and isinstance(update, dict):
      tool_call = update.get("tool_call") or update.get("toolCall")
    if not isinstance(tool_call, dict):
      tool_call = {}
    payload = self._unwrap_tool_payload(tool_call)
    name = self._tool_name_from_payload(tool_call, payload if isinstance(payload, dict) else {})
    # fallback to legacy attrs if present
    if name == "tool":
      legacy = getattr(update, "name", None)
      if isinstance(legacy, str) and legacy.strip():
        name = legacy.strip()
    args = self._tool_args_from_payload(payload if isinstance(payload, dict) else {})
    if args in (None, {}, "") and getattr(update, "args", None) is not None:
      args = getattr(update, "args")
    result = self._tool_result_from_payload(payload if isinstance(payload, dict) else {})
    if result is None and getattr(update, "result", None) is not None:
      result = getattr(update, "result")
    return name, args, result

  def _command_preview(self, args) -> str:
    if isinstance(args, str):
      text = args.strip()
      if text.startswith("{") and text.endswith("}"):
        try:
          parsed = json.loads(text)
          if isinstance(parsed, dict):
            args = parsed
          else:
            return (text[:120] + "…") if len(text) > 120 else text
        except json.JSONDecodeError:
          return (text[:120] + "…") if len(text) > 120 else text
      else:
        cmd = " ".join(text.split())
        return (cmd[:120] + "…") if len(cmd) > 120 else cmd
    cmd = self._first_str(args, "command", "cmd") if isinstance(args, dict) else ""
    cmd = " ".join(str(cmd).split())
    return (cmd[:120] + "…") if len(cmd) > 120 else cmd

  def _is_network_command(self, cmd: str) -> bool:
    if not cmd:
      return False
    return bool(re.search(r"\b(curl|wget|http://|https://)\b", cmd, re.I))

  def _extract_patch_targets(self, text: str) -> list[str]:
    if not text:
      return []
    matches = re.findall(r"\*\*\* (?:Add|Update) File: (.+)", text)
    return matches[:6]

  def _extract_patch_preview(self, text: str) -> list[dict]:
    if not text:
      return []
    previews: list[dict] = []
    current_path = ""
    removed: list[str] = []
    added: list[str] = []
    for line in text.splitlines():
      if line.startswith("*** Add File: ") or line.startswith("*** Update File: "):
        if current_path and (removed or added):
          previews.append({"path": current_path, "removed": removed[:3], "added": added[:3]})
        current_path = line.split(": ", 1)[1].strip()
        removed = []
        added = []
      elif line.startswith("-") and not line.startswith("---"):
        removed.append(line[1:])
      elif line.startswith("+") and not line.startswith("+++"):
        added.append(line[1:])
    if current_path and (removed or added):
      previews.append({"path": current_path, "removed": removed[:3], "added": added[:3]})
    return previews[:3]

  def _tool_summary(self, name: str, args=None, result=None, status: str = "unknown") -> dict:
    raw_name = (name or "tool").strip() or "tool"
    lowered = re.sub(r"[^a-z0-9]", "", raw_name.lower())
    paths = self._collect_paths(args) or self._collect_paths(result)
    cmd = self._command_preview(args)
    query = ""
    if isinstance(args, dict):
      query = self._first_str(args, "query", "search_term", "pattern", "glob_pattern", "url", "description")
    patch_text = ""
    if isinstance(args, str):
      patch_text = args
    elif isinstance(args, dict):
      for key in ("patch", "old_string", "new_string"):
        if isinstance(args.get(key), str) and "*** " in args.get(key, ""):
          patch_text = args[key]
          break
    patch_paths = self._extract_patch_targets(patch_text)
    if patch_paths:
      paths = patch_paths
    patch_preview = self._extract_patch_preview(patch_text)
    path_detail = ", ".join(paths) if paths else ""
    detail = path_detail or query or cmd or raw_name

    if lowered == "tool" and cmd:
      return {
        "kind": "run",
        "title": ("Running: " if status == "running" else "Ran: ") + cmd,
        "detail": cmd,
        "paths": paths,
      }
    if lowered in {"read", "readfile", "readfiles", "cat"}:
      return {
        "kind": "explore",
        "title": f"Read {paths[0] if paths else 'file'}",
        "detail": detail,
        "paths": paths,
      }
    if lowered in {"glob", "find", "ls", "listdir", "list_dir", "list"}:
      return {
        "kind": "explore",
        "title": f"Listed {query or (paths[0] if paths else 'files')}",
        "detail": detail,
        "paths": paths,
      }
    if lowered in {"rg", "grep", "search", "ripgrep"}:
      return {
        "kind": "explore",
        "title": f"Grepped {query or 'workspace'}",
        "detail": detail,
        "paths": paths,
      }
    if lowered == "websearch":
      term = query or (self._first_str(args, "search_term", "q") if isinstance(args, dict) else "")
      label = (term or "web")[:80]
      return {
        "kind": "explore",
        "title": ("Searching " if status == "running" else "Searched ") + label,
        "detail": detail,
        "paths": paths,
      }
    if lowered == "webfetch":
      url = query or (self._first_str(args, "url") if isinstance(args, dict) else "")
      host = url
      if url:
        try:
          from urllib.parse import urlparse
          host = urlparse(url).netloc or url
        except Exception:
          host = url
      label = (host or "page")[:80]
      return {
        "kind": "explore",
        "title": ("Fetching " if status == "running" else "Fetched ") + label,
        "detail": detail or url,
        "paths": paths,
      }
    if lowered in {"semsearch", "semanticsearch"}:
      return {
        "kind": "explore",
        "title": f"Searched {query or 'workspace'}",
        "detail": detail,
        "paths": paths,
      }
    if lowered in {"applypatch", "editnotebook", "strreplace", "edit", "searchreplace"}:
      return {
        "kind": "edit",
        "title": ("Editing " if status == "running" else "Edited ") + (paths[0] if paths else "code"),
        "detail": detail,
        "paths": paths,
        "diff": patch_preview,
      }
    if lowered in {"write"}:
      return {
        "kind": "edit",
        "title": ("Writing " if status == "running" else "Wrote ") + (paths[0] if paths else "file"),
        "detail": detail,
        "paths": paths,
      }
    if lowered in {"delete"}:
      return {
        "kind": "edit",
        "title": ("Deleting " if status == "running" else "Deleted ") + (paths[0] if paths else "file"),
        "detail": detail,
        "paths": paths,
      }
    if lowered in {"todowrite", "todo", "updatetodos"}:
      return {"kind": "plan", "title": "Updated todos", "detail": detail or "Refreshed task list", "paths": []}
    if lowered in {"createplan"}:
      return {"kind": "plan", "title": "Created plan", "detail": detail or "Plan draft", "paths": []}
    if lowered in {"task"}:
      task_desc = query or (self._first_str(args, "prompt", "description", "message") if isinstance(args, dict) else "")
      return {"kind": "plan", "title": "Task" + (f": {task_desc[:80]}" if task_desc else ""), "detail": detail or task_desc, "paths": []}
    if lowered in {"mcp"}:
      mcp_tool = ""
      if isinstance(args, dict):
        mcp_tool = self._first_str(args, "toolName", "tool_name", "name", "tool")
      return {
        "kind": "tool",
        "title": f"Called {mcp_tool or 'MCP tool'}",
        "detail": detail,
        "paths": paths,
      }
    if lowered in {"generateimage"}:
      return {"kind": "tool", "title": "Generated image", "detail": detail, "paths": paths}
    if lowered in {"recordscreen"}:
      return {"kind": "run", "title": "Recorded screen", "detail": detail, "paths": paths}
    if lowered in {"readlints", "lint", "diagnostics"}:
      return {"kind": "verify", "title": "Read lints", "detail": detail, "paths": paths}
    if lowered in {"shell", "awaitshell", "bash", "terminal", "runterminalcmd", "runterminal"}:
      if self._is_network_command(cmd):
        return {
          "kind": "explore",
          "title": ("Fetching " if status == "running" else "Fetched ") + (cmd[:80] or "web"),
          "detail": detail,
          "paths": paths,
        }
      return {
        "kind": "run",
        "title": ("Running: " if status == "running" else "Ran: ") + (cmd or raw_name),
        "detail": detail,
        "paths": paths,
      }
    return {
      "kind": "tool",
      "title": (("Running " if status == "running" else "Ran ") + raw_name) if raw_name != "tool" else (("Running: " if status == "running" else "Ran: ") + (cmd or detail or "command")),
      "detail": detail if detail != raw_name else self._stringify(args)[:200],
      "paths": paths,
    }

  def _friendly_error(self, message: str) -> str:
    msg = (message or "").strip() or "unknown"
    lower = msg.lower()
    if (
      ("context" in lower and any(k in lower for k in ("limit", "length", "window", "overflow", "exceed", "too long")))
      or "maximum context" in lower
      or "prompt is too long" in lower
      or ("token" in lower and "limit" in lower)
      or ("上下文" in msg and ("超" in msg or "过长" in msg))
    ):
      return "上下文已超限，请点击「新对话」清空后重试，或缩短本次输入/附件。原始错误: " + msg
    if "agent_busy" in lower or "agent is busy" in lower or "busy" in lower and "agent" in lower:
      return "上一条仍在执行，请稍等片刻后重试，或点击「新对话」。原始错误: " + msg
    if lower == "internal error" or "internal error" in lower:
      return "服务内部错误，常见于上一条被中断后 Agent 尚未释放。请再发一次或开新对话。原始错误: " + msg
    return msg

  def _is_image(self, mime_type: str) -> bool:
    return (mime_type or "").startswith("image/")

  def _image_attachments(self, attachments: list[dict] | None) -> list[dict]:
    return [
      item for item in (attachments or [])
      if self._is_image(item.get("mime_type") or "") and item.get("data")
    ]

  def _safe_filename(self, name: str) -> str:
    base = Path(name or "file").name
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", base).strip("._") or "file"
    return cleaned[:120]

  def _materialize_files(self, attachments: list[dict] | None) -> list[dict]:
    """Write non-image uploads into host workspace; SDK only accepts images natively."""
    if not attachments:
      return []
    host_root = Path(self.settings["host_root"]).resolve()
    upload_dir = host_root / ".ai-agent-uploads"
    upload_dir.mkdir(parents=True, exist_ok=True)
    saved: list[dict] = []
    for item in attachments:
      mime = item.get("mime_type") or "application/octet-stream"
      if self._is_image(mime):
        continue
      raw = item.get("data") or ""
      try:
        data = base64.b64decode(raw, validate=False)
      except Exception:
        continue
      if not data:
        continue
      filename = self._safe_filename(item.get("name") or "file")
      path = upload_dir / f"{uuid.uuid4().hex[:8]}_{filename}"
      path.write_bytes(data)
      rel = str(path.relative_to(host_root))
      saved.append({"name": filename, "mime_type": mime, "path": rel})
    return saved

  def _build_message(self, text: str, attachments: list[dict] | None):
    prompt = text.strip() if text else ""
    images = self._image_attachments(attachments)
    files = self._materialize_files(attachments)
    if files:
      listing = "\n".join(f"- {f['path']}" for f in files)
      note = (
        "用户上传了以下文件（已保存到工作区，请按需读取这些路径）：\n"
        f"{listing}"
      )
      prompt = f"{prompt}\n\n{note}" if prompt else note
    if not prompt and images:
      prompt = "请分析我上传的图片。"
    if not images:
      return prompt, files
    sdk_images = [
      SDKImage.data_image(image["data"], image["mime_type"])
      for image in images
    ]
    return UserMessage(text=prompt, images=sdk_images), files

  def _upload_meta(self, attachments: list[dict] | None, files: list[dict]) -> dict:
    """This-turn upload receipt for the UI (not persisted session history)."""
    images = [
      {"name": item.get("name") or "image", "mime_type": item.get("mime_type") or "application/octet-stream"}
      for item in self._image_attachments(attachments)
    ]
    return {"images": images, "files": files}

  def _model_id_from_selection(self, value) -> str:
    if value is None:
      return ""
    if isinstance(value, str):
      mid = value.strip()
    elif isinstance(value, dict):
      mid = str(value.get("id") or "").strip()
    else:
      mid = str(getattr(value, "id", "") or "").strip()
    return normalize_model_id(mid)

  def _resolved_model_payload(self, resolved_id: str) -> dict:
    rid = (resolved_id or "").strip()
    if not rid or rid in {"auto", "default"}:
      return {}
    return {
      "resolved_model": rid,
      "resolved_model_label": model_display_name(rid) or rid,
    }

  def _tool_call_event(
    self,
    session: Session,
    *,
    call_id: str,
    name: str,
    status: str,
    args,
    result,
    include_empty: bool = False,
  ) -> dict:
    """Build one SSE tool_call event from an on_delta tool update."""
    # UI only distinguishes live vs done; treat terminal failures as completed.
    raw = (status or "running").strip().lower()
    status = "completed" if raw in {"completed", "error", "failed", "cancelled", "canceled"} else "running"
    summary = self._tool_summary(name, args, result, status)
    event = {
      "type": "tool_call",
      "session_id": session.session_id,
      "model": session.model,
      "call_id": call_id or "",
      "name": name,
      "status": status,
      "args": self._stringify(args) if (include_empty or status == "running") else "",
      "result": self._stringify(result) if (include_empty or status == "completed") else "",
      "summary": summary,
      "args_json": self._jsonable(args),
    }
    if include_empty or status == "completed":
      event["result_json"] = self._jsonable(result)
    return event

  def _sse_from_delta(self, update, session: Session) -> dict | None:
    """Map an SDK on_delta update to one SSE event (or None to skip)."""
    update_type = getattr(update, "type", None)
    if update_type == "summary-started":
      return {"type": "planning", "content": "", "session_id": session.session_id, "model": session.model}
    if update_type == "summary-update":
      return {
        "type": "planning",
        "content": getattr(update, "text", ""),
        "session_id": session.session_id,
        "model": session.model,
      }
    if update_type == "thinking-delta":
      return {
        "type": "thinking",
        "content": getattr(update, "text", ""),
        "session_id": session.session_id,
        "model": session.model,
      }
    if update_type in {"tool-call-started", "partial-tool-call", "tool-call-completed"}:
      name, args, result = self._extract_tool_fields(update)
      status = "completed" if update_type == "tool-call-completed" else "running"
      return self._tool_call_event(
        session,
        call_id=getattr(update, "call_id", "") or "",
        name=name,
        status=status,
        args=args,
        result=result,
      )
    if update_type == "text-delta":
      return {
        "type": "text",
        "content": getattr(update, "text", ""),
        "session_id": session.session_id,
        "model": session.model,
      }
    return None

  async def _sse_from_run_messages(self, run, session: Session) -> AsyncIterator[dict]:
    """Map run.messages() items to SSE events."""
    async for message in run.messages():
      msg_type = getattr(message, "type", None)
      if msg_type == "system":
        resolved = self._model_id_from_selection(getattr(message, "model", None))
        payload = self._resolved_model_payload(resolved)
        if payload:
          yield {
            "type": "model_resolved",
            "session_id": session.session_id,
            "model": session.model,
            **payload,
          }
      elif msg_type == "status":
        yield {
          "type": "status",
          "session_id": session.session_id,
          "model": session.model,
          "status": getattr(message, "status", "unknown"),
          "content": getattr(message, "message", "") or getattr(message, "status", ""),
        }
      elif msg_type == "task":
        yield {
          "type": "task",
          "session_id": session.session_id,
          "model": session.model,
          "status": getattr(message, "status", "unknown"),
          "content": getattr(message, "text", ""),
        }
      # tool_call comes from on_delta (_sse_from_delta); skip here to avoid duplicate SSE.

  async def send(
    self,
    session_id: str | None,
    message: str,
    model: str | dict | None = None,
    mode: str = "agent",
    attachments: list[dict] | None = None,
  ) -> dict:
    session = await self.get_or_create(session_id, model)
    async with session.lock:
      run = None
      try:
        await self._cancel_session_run(session)
        payload, files = self._build_message(message, attachments)
        upload_meta = self._upload_meta(attachments, files)
        run = await session.agent.send(payload, SendOptions(mode=mode))
        session.active_run = run
        result = await run.wait()
        reply = await run.text()
        resolved = self._model_id_from_selection(getattr(result, "model", None))
        return {
          "session_id": session.session_id,
          "reply": reply,
          "status": result.status,
          "run_id": run.id,
          "agent_id": session.agent.agent_id,
          "model": session.model,
          **self._resolved_model_payload(resolved),
          **upload_meta,
        }
      except CursorAgentError as err:
        # ponytail: leave reply empty; HTTP layer maps status=error → 502 detail
        return {
          "session_id": session.session_id,
          "reply": "",
          "status": "error",
          "error": self._friendly_error(err.message),
          "model": session.model,
        }
      finally:
        if session.active_run is run:
          session.active_run = None

  async def stream(
    self,
    session_id: str | None,
    message: str,
    model: str | dict | None = None,
    mode: str = "agent",
    attachments: list[dict] | None = None,
  ) -> AsyncIterator[dict]:
    session = await self.get_or_create(session_id, model)
    async with session.lock:
      run = None
      forward_task = None
      try:
        await self._cancel_session_run(session)
        payload, files = self._build_message(message, attachments)
        upload_meta = self._upload_meta(attachments, files)
        if upload_meta["images"] or upload_meta["files"]:
          yield {
            "type": "upload",
            "session_id": session.session_id,
            "model": session.model,
            **upload_meta,
          }
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue[dict | None] = asyncio.Queue()

        def on_delta(update) -> None:
          event = self._sse_from_delta(update, session)
          if event:
            loop.call_soon_threadsafe(queue.put_nowait, event)

        run = await session.agent.send(
          payload,
          SendOptions(on_delta=on_delta, mode=mode),
        )
        session.active_run = run

        async def forward_messages() -> None:
          try:
            async for event in self._sse_from_run_messages(run, session):
              await queue.put(event)
          finally:
            await queue.put(None)

        forward_task = asyncio.create_task(forward_messages())
        try:
          while True:
            event = await queue.get()
            if event is None:
              break
            yield event
        finally:
          if forward_task and not forward_task.done():
            forward_task.cancel()
            try:
              await forward_task
            except asyncio.CancelledError:
              pass

        result = await run.wait()
        resolved = self._model_id_from_selection(getattr(result, "model", None))
        yield {
          "type": "done",
          "session_id": session.session_id,
          "status": result.status,
          "run_id": run.id,
          "agent_id": session.agent.agent_id,
          "model": session.model,
          **self._resolved_model_payload(resolved),
        }
      except asyncio.CancelledError:
        await self._cancel_run(run)
        raise
      except CursorAgentError as err:
        yield {
          "type": "error",
          "session_id": session.session_id,
          "content": self._friendly_error(err.message),
          "model": session.model,
        }
      finally:
        if session.active_run is run:
          session.active_run = None
