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
    await self._stack.aclose()
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
    if close:
      await close()

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
          if lowered in {"path", "paths", "file", "files", "target_file", "target_notebook", "working_directory"}:
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
    lowered = (name or "tool").lower()
    paths = self._collect_paths(args) or self._collect_paths(result)
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

    if lowered in {"readfile", "glob", "rg"}:
      return {
        "kind": "explore",
        "title": f"Explored {max(1, len(paths))} file{'s' if len(paths) != 1 else ''}",
        "detail": ", ".join(paths) if paths else name,
        "paths": paths,
      }
    if lowered in {"applypatch", "editnotebook", "delete"}:
      return {
        "kind": "edit",
        "title": "Edit attempted" if status == "running" else "Edited code",
        "detail": ", ".join(paths) if paths else name,
        "paths": paths,
        "diff": patch_preview,
      }
    if lowered in {"todowrite"}:
      return {"kind": "plan", "title": "Updated plan", "detail": "Refreshed task list", "paths": []}
    if lowered in {"readlints"}:
      return {"kind": "verify", "title": "Checked diagnostics", "detail": ", ".join(paths) if paths else name, "paths": paths}
    if lowered in {"shell", "awaitshell"}:
      return {
        "kind": "run",
        "title": "Ran command" if status == "running" else "Command finished",
        "detail": ", ".join(paths) if paths else name,
        "paths": paths,
      }
    return {"kind": "tool", "title": name or "Tool call", "detail": ", ".join(paths) if paths else "", "paths": paths}

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
    if update_type == "tool-call-started":
      summary = self._tool_summary(
        getattr(update, "name", "tool"),
        getattr(update, "args", None),
        None,
        "running",
      )
      return {
        "type": "tool_call",
        "session_id": session.session_id,
        "model": session.model,
        "call_id": getattr(update, "call_id", ""),
        "name": getattr(update, "name", "tool"),
        "status": "running",
        "args": self._stringify(getattr(update, "args", None)),
        "result": "",
        "summary": summary,
        "args_json": self._jsonable(getattr(update, "args", None)),
      }
    if update_type == "tool-call-completed":
      summary = self._tool_summary(
        getattr(update, "name", "tool"),
        None,
        getattr(update, "result", None),
        "completed",
      )
      return {
        "type": "tool_call",
        "session_id": session.session_id,
        "model": session.model,
        "call_id": getattr(update, "call_id", ""),
        "name": getattr(update, "name", "tool"),
        "status": "completed",
        "args": "",
        "result": self._stringify(getattr(update, "result", None)),
        "summary": summary,
        "result_json": self._jsonable(getattr(update, "result", None)),
      }
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
