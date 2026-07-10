"""Per-session Cursor agents backed by one shared AsyncClient."""

from __future__ import annotations

import asyncio
import json
import re
import time
import uuid
from collections import deque
from contextlib import AsyncExitStack
from dataclasses import dataclass, field
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


@dataclass
class Session:
    session_id: str
    agent: object
    model: str
    created_at: float = field(default_factory=time.time)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    recent_images: deque[dict] = field(default_factory=lambda: deque(maxlen=5))


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

  def _agent_options(self, model: str):
    s = self.settings
    if s["runtime"] == "cloud":
      if not s["cloud_repo_url"]:
        raise RuntimeError("agent.runtime is cloud but agent.cloud.repo_url is empty")
      return {
        "model": model,
        "api_key": s["api_key"],
        "cloud": CloudAgentOptions(
          repos=[CloudRepository(url=s["cloud_repo_url"], starting_ref=s["cloud_starting_ref"])],
          auto_create_pr=s["cloud_auto_create_pr"],
        ),
      }
    return {
      "model": model,
      "api_key": s["api_key"],
      "local": LocalAgentOptions(cwd=str(s["host_root"])),
    }

  async def _close_agent(self, agent) -> None:
    close = getattr(agent, "close", None)
    if not close:
      return
    try:
      await close()
    except Exception:
      # Bridge already down during process exit / hot reload.
      pass

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
    """SDK puts tool info under update.tool_call, often as {readToolCall: {...}}."""
    if not isinstance(value, dict) or not value:
      return value
    if any(k in value for k in ("name", "toolName", "tool_name", "args", "arguments", "input", "result", "output")):
      return value
    if len(value) == 1:
      only = next(iter(value.values()))
      if isinstance(only, dict):
        return only
    for key, nested in value.items():
      if isinstance(nested, dict) and key.lower().endswith(("toolcall", "tool_call", "call")):
        return nested
    return value

  def _tool_name_from_payload(self, tool_call, payload) -> str:
    for source in (tool_call, payload):
      if not isinstance(source, dict):
        continue
      for key in ("name", "toolName", "tool_name", "tool", "functionName", "function_name"):
        val = source.get(key)
        if isinstance(val, str) and val.strip():
          return val.strip()
    if isinstance(tool_call, dict):
      for key in tool_call:
        lowered = str(key)
        if lowered.endswith("ToolCall"):
          return lowered[: -len("ToolCall")]
        if lowered.endswith("_tool_call"):
          return lowered[: -len("_tool_call")]
        if lowered.endswith("Tool"):
          return lowered[: -len("Tool")]
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
    cmd = self._first_str(args, "command", "cmd") if isinstance(args, dict) else ""
    if not cmd and isinstance(args, str):
      cmd = args
    cmd = " ".join(str(cmd).split())
    return (cmd[:120] + "…") if len(cmd) > 120 else cmd

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

    if lowered in {"read", "readfile", "readfiles", "cat"}:
      return {
        "kind": "explore",
        "title": f"Read {paths[0] if paths else 'file'}",
        "detail": detail,
        "paths": paths,
      }
    if lowered in {"glob", "find", "ls", "listdir", "list_dir"}:
      return {
        "kind": "explore",
        "title": f"List {query or (paths[0] if paths else 'files')}",
        "detail": detail,
        "paths": paths,
      }
    if lowered in {"rg", "grep", "search", "ripgrep", "websearch", "webfetch"}:
      return {
        "kind": "explore",
        "title": f"Search {query or raw_name}",
        "detail": detail,
        "paths": paths,
      }
    if lowered in {"applypatch", "editnotebook", "delete", "write", "strreplace", "edit", "searchreplace"}:
      return {
        "kind": "edit",
        "title": ("Editing " if status == "running" else "Edited ") + (paths[0] if paths else "code"),
        "detail": detail,
        "paths": paths,
        "diff": patch_preview,
      }
    if lowered in {"todowrite", "todo", "task"}:
      return {"kind": "plan", "title": "Updated plan", "detail": detail or "Refreshed task list", "paths": []}
    if lowered in {"readlints", "lint", "diagnostics"}:
      return {"kind": "verify", "title": "Checked diagnostics", "detail": detail, "paths": paths}
    if lowered in {"shell", "awaitshell", "bash", "terminal", "runterminalcmd"}:
      return {
        "kind": "run",
        "title": ("Running: " if status == "running" else "Ran: ") + (cmd or raw_name),
        "detail": detail,
        "paths": paths,
      }
    return {
      "kind": "tool",
      "title": raw_name,
      "detail": detail if detail != raw_name else self._stringify(args)[:200],
      "paths": paths,
    }

  def _assistant_text(self, message) -> str:
    content = getattr(getattr(message, "message", None), "content", None) or []
    parts: list[str] = []
    for block in content:
      if getattr(block, "type", None) == "text":
        text = getattr(block, "text", "")
        if text:
          parts.append(text)
    return "".join(parts)

  def _image_message(self, text: str, images: list[dict] | None):
    prompt = text.strip() if text else ""
    if not prompt and images:
      prompt = "请分析我上传的图片。"
    if not images:
      return prompt
    sdk_images = [
      SDKImage.data_image(image["data"], image["mime_type"])
      for image in images
      if image.get("data") and image.get("mime_type")
    ]
    return UserMessage(text=prompt, images=sdk_images)

  def _remember_images(self, session: Session, images: list[dict] | None) -> list[dict]:
    if not images:
      return []
    remembered = []
    for image in images:
      item = {
        "name": image.get("name") or "image",
        "mime_type": image.get("mime_type") or "application/octet-stream",
      }
      session.recent_images.append(item)
      remembered.append(item)
    return remembered

  def _delta_event(self, update, session: Session) -> dict | None:
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
      summary = self._tool_summary(name, args, result, status)
      event = {
        "type": "tool_call",
        "session_id": session.session_id,
        "model": session.model,
        "call_id": getattr(update, "call_id", "") or "",
        "name": name,
        "status": status,
        "args": self._stringify(args) if status == "running" else "",
        "result": self._stringify(result) if status == "completed" else "",
        "summary": summary,
        "args_json": self._jsonable(args),
      }
      if status == "completed":
        event["result_json"] = self._jsonable(result)
      return event
    if update_type == "text-delta":
      return {
        "type": "text",
        "content": getattr(update, "text", ""),
        "session_id": session.session_id,
        "model": session.model,
      }
    return None

  async def _stream_run_messages(self, run, session: Session) -> AsyncIterator[dict]:
    async for message in run.messages():
      msg_type = getattr(message, "type", None)
      if msg_type == "status":
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
      elif msg_type == "tool_call":
        name = getattr(message, "name", None) or "tool"
        status = getattr(message, "status", "running") or "running"
        args = getattr(message, "args", None)
        result = getattr(message, "result", None)
        summary = self._tool_summary(name, args, result, status)
        yield {
          "type": "tool_call",
          "session_id": session.session_id,
          "model": session.model,
          "call_id": getattr(message, "call_id", "") or "",
          "name": name,
          "status": "completed" if status == "completed" else "running",
          "args": self._stringify(args),
          "result": self._stringify(result),
          "summary": summary,
          "args_json": self._jsonable(args),
          "result_json": self._jsonable(result),
        }

  async def _stream_run(self, run, session: Session) -> AsyncIterator[dict]:
    queue: asyncio.Queue[dict | None] = asyncio.Queue()

    async def forward_messages() -> None:
      try:
        async for event in self._stream_run_messages(run, session):
          await queue.put(event)
      finally:
        await queue.put(None)

    task = asyncio.create_task(forward_messages())
    try:
      while True:
        event = await queue.get()
        if event is None:
          break
        yield event
    finally:
      await task

  async def get_or_create(self, session_id: str | None, model: str | None = None) -> Session:
    await self.start()
    selected_model = model or self.settings["model"]
    if session_id and session_id in self._sessions:
      session = self._sessions[session_id]
      if session.model == selected_model:
        return session
      await self._close_agent(session.agent)
      del self._sessions[session_id]

    sid = session_id or uuid.uuid4().hex
    assert self._client is not None
    agent = await self._stack.enter_async_context(
      await self._client.agents.create(**self._agent_options(selected_model))
    )
    session = Session(session_id=sid, agent=agent, model=selected_model)
    self._sessions[sid] = session
    return session

  async def send(self, session_id: str | None, message: str, model: str | None = None, images: list[dict] | None = None) -> dict:
    session = await self.get_or_create(session_id, model)
    async with session.lock:
      try:
        self._remember_images(session, images)
        run = await session.agent.send(self._image_message(message, images), SendOptions())
        result = await run.wait()
        reply = await run.text()
        return {
          "session_id": session.session_id,
          "reply": reply,
          "status": result.status,
          "run_id": run.id,
          "agent_id": session.agent.agent_id,
          "model": session.model,
          "recent_images": list(session.recent_images),
        }
      except CursorAgentError as err:
        return {
          "session_id": session.session_id,
          "reply": f"Agent startup failed: {err.message}",
          "status": "error",
          "error": err.message,
          "model": session.model,
          "recent_images": list(session.recent_images),
        }

  async def stream(self, session_id: str | None, message: str, model: str | None = None, images: list[dict] | None = None) -> AsyncIterator[dict]:
    session = await self.get_or_create(session_id, model)
    async with session.lock:
      try:
        remembered = self._remember_images(session, images)
        if remembered:
          yield {
            "type": "upload",
            "session_id": session.session_id,
            "model": session.model,
            "images": remembered,
            "recent_images": list(session.recent_images),
          }
        loop = asyncio.get_running_loop()

        def on_delta(update) -> None:
          event = self._delta_event(update, session)
          if event:
            loop.call_soon_threadsafe(queue.put_nowait, event)

        queue: asyncio.Queue[dict | None] = asyncio.Queue()
        run = await session.agent.send(
          self._image_message(message, images),
          SendOptions(on_delta=on_delta),
        )

        async def forward_messages() -> None:
          try:
            async for event in self._stream_run_messages(run, session):
              await queue.put(event)
          finally:
            await queue.put(None)

        task = asyncio.create_task(forward_messages())
        while True:
          event = await queue.get()
          if event is None:
            break
          yield event
        await task
        result = await run.wait()
        yield {
          "type": "done",
          "session_id": session.session_id,
          "status": result.status,
          "run_id": run.id,
          "agent_id": session.agent.agent_id,
          "model": session.model,
          "recent_images": list(session.recent_images),
        }
      except CursorAgentError as err:
        yield {
          "type": "error",
          "session_id": session.session_id,
          "content": err.message,
          "model": session.model,
          "recent_images": list(session.recent_images),
        }
