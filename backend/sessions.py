"""Per-session Cursor agents backed by one shared AsyncClient."""

from __future__ import annotations

import asyncio
import json
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

  async def _stream_run_messages(self, run, session: Session) -> AsyncIterator[dict]:
    async for message in run.messages():
      msg_type = getattr(message, "type", None)
      if msg_type == "assistant":
        text = self._assistant_text(message)
        if text:
          yield {"type": "text", "content": text, "session_id": session.session_id, "model": session.model}
      elif msg_type == "thinking":
        text = getattr(message, "text", "")
        if text:
          yield {"type": "thinking", "content": text, "session_id": session.session_id, "model": session.model}
      elif msg_type == "tool_call":
        yield {
          "type": "tool_call",
          "session_id": session.session_id,
          "model": session.model,
          "name": getattr(message, "name", "tool"),
          "status": getattr(message, "status", "unknown"),
          "args": self._stringify(getattr(message, "args", None)),
          "result": self._stringify(getattr(message, "result", None)),
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
        run = await session.agent.send(self._image_message(message, images))
        parts: list[str] = []
        async for event in self._stream_run_messages(run, session):
          if event["type"] == "text":
            parts.append(event["content"])
        result = await run.wait()
        return {
          "session_id": session.session_id,
          "reply": "".join(parts),
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
        run = await session.agent.send(self._image_message(message, images))
        async for event in self._stream_run_messages(run, session):
          yield event
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
