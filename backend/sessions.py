"""Per-session Cursor agents backed by one shared AsyncClient."""

from __future__ import annotations

import asyncio
import time
import uuid
from contextlib import AsyncExitStack
from dataclasses import dataclass, field
from typing import AsyncIterator

from cursor_sdk import AsyncClient, CloudAgentOptions, CloudRepository, CursorAgentError, LocalAgentOptions


@dataclass
class Session:
    session_id: str
    agent: object
    created_at: float = field(default_factory=time.time)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


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

  def _agent_options(self):
    s = self.settings
    if s["runtime"] == "cloud":
      if not s["cloud_repo_url"]:
        raise RuntimeError("agent.runtime is cloud but agent.cloud.repo_url is empty")
      return {
        "model": s["model"],
        "api_key": s["api_key"],
        "cloud": CloudAgentOptions(
          repos=[CloudRepository(url=s["cloud_repo_url"], starting_ref=s["cloud_starting_ref"])],
          auto_create_pr=s["cloud_auto_create_pr"],
        ),
      }
    return {
      "model": s["model"],
      "api_key": s["api_key"],
      "local": LocalAgentOptions(cwd=str(s["host_root"])),
    }

  async def _close_agent(self, agent) -> None:
    close = getattr(agent, "close", None)
    if close:
      await close()

  async def get_or_create(self, session_id: str | None) -> Session:
    await self.start()
    if session_id and session_id in self._sessions:
      return self._sessions[session_id]

    sid = session_id or uuid.uuid4().hex
    assert self._client is not None
    agent = await self._stack.enter_async_context(
      await self._client.agents.create(**self._agent_options())
    )
    session = Session(session_id=sid, agent=agent)
    self._sessions[sid] = session
    return session

  async def send(self, session_id: str | None, message: str) -> dict:
    session = await self.get_or_create(session_id)
    async with session.lock:
      try:
        run = await session.agent.send(message)
        parts: list[str] = []
        async for chunk in run.iter_text():
          parts.append(chunk)
        result = await run.wait()
        return {
          "session_id": session.session_id,
          "reply": "".join(parts),
          "status": result.status,
          "run_id": run.id,
          "agent_id": session.agent.agent_id,
        }
      except CursorAgentError as err:
        return {
          "session_id": session.session_id,
          "reply": f"Agent startup failed: {err.message}",
          "status": "error",
          "error": err.message,
        }

  async def stream(self, session_id: str | None, message: str) -> AsyncIterator[dict]:
    session = await self.get_or_create(session_id)
    async with session.lock:
      try:
        run = await session.agent.send(message)
        async for chunk in run.iter_text():
          yield {"type": "text", "content": chunk, "session_id": session.session_id}
        result = await run.wait()
        yield {
          "type": "done",
          "session_id": session.session_id,
          "status": result.status,
          "run_id": run.id,
          "agent_id": session.agent.agent_id,
        }
      except CursorAgentError as err:
        yield {
          "type": "error",
          "session_id": session.session_id,
          "content": err.message,
        }
