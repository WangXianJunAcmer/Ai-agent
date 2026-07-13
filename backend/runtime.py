"""Owns Cursor bridge, session map, send/stream/cancel. HTTP stays thin."""

from __future__ import annotations

import asyncio
import uuid
from contextlib import AsyncExitStack
from typing import AsyncIterator

from cursor_sdk import (
  AsyncClient,
  CloudAgentOptions,
  CloudRepository,
  CursorAgentError,
  LocalAgentOptions,
  SendOptions,
)
from cursor_sdk.errors import AgentBusyError

from backend.attachments import build_message, upload_meta
from backend.safety import (
  OUTPUT_BLOCK_SECRET,
  input_block_reason,
  sanitize_event,
  scrub_reply,
  set_known_secrets,
  text_has_secret,
)
from backend.sessions import Session, model_key
from backend.tool_display import (
  friendly_error,
  model_id_from_selection,
  resolved_model_payload,
  sse_from_delta,
  sse_from_run_messages,
)

_TERMINAL_RUN_STATUSES = frozenset({"finished", "error", "cancelled", "expired"})


class SessionManager:
  def __init__(self, settings: dict):
    self.settings = settings
    self._stack = AsyncExitStack()
    self._client: AsyncClient | None = None
    self._sessions: dict[str, Session] = {}
    self._started = False
    set_known_secrets(str(settings.get("api_key") or ""))

  async def start(self) -> None:
    if self._started:
      return
    set_known_secrets(str(self.settings.get("api_key") or ""))
    host_root = str(self.settings["host_root"])
    self._client = await self._stack.enter_async_context(
      await AsyncClient.launch_bridge(workspace=host_root)
    )
    self._started = True

  async def stop(self) -> None:
    for session in list(self._sessions.values()):
      await self._close_agent(session.agent)
    self._sessions.clear()
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
    key = model_key(model_selection)
    if session_id and session_id in self._sessions:
      session = self._sessions[session_id]
      if session.model_key == key:
        return session
      await self._close_agent(session.agent)
      del self._sessions[session_id]

    sid = session_id or uuid.uuid4().hex
    assert self._client is not None
    # Manage close() ourselves — stacking every agent on AsyncExitStack leaks on model switch.
    agent = await self._client.agents.create(**self._agent_options(model_selection))
    session = Session(
      session_id=sid,
      agent=agent,
      model=selected_model,
      model_key=key,
      model_selection=model_selection,
    )
    self._sessions[sid] = session
    return session

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
      for _ in range(100):
        status = getattr(run, "status", None) or "running"
        if status in _TERMINAL_RUN_STATUSES:
          return
        await asyncio.sleep(0.05)
    except Exception:
      pass

  async def _cancel_session_run(self, session: Session, *, bump: bool = True) -> None:
    # bump=True only for explicit /cancel — preparatory cleanup in _start_run must
    # not bump, or a cancel during send-setup gets absorbed when stream re-syncs turn.
    if bump:
      session.turn += 1
    run = session.active_run
    if run is None:
      return
    session.active_run = None
    await self._cancel_run(run)

  async def cancel(self, session_id: str | None) -> None:
    if not session_id or session_id not in self._sessions:
      return
    session = self._sessions[session_id]
    await self._cancel_session_run(session, bump=True)

  async def _recycle_agent(self, session: Session) -> None:
    """Close the busy agent and create a fresh one (keeps session_id)."""
    await self._cancel_session_run(session, bump=False)
    old = session.agent
    assert self._client is not None
    selection = session.model_selection or session.model or self.settings["model"]
    session.agent = await self._client.agents.create(**self._agent_options(selection))
    await self._close_agent(old)

  def _is_busy_error(self, err: Exception) -> bool:
    msg = (getattr(err, "message", None) or str(err) or "").lower()
    if isinstance(err, AgentBusyError):
      return True
    return (
      "agent_busy" in msg
      or "agent is busy" in msg
      or msg.strip() == "internal error"
      or "internal error" in msg
    )

  async def _start_run(self, session: Session, payload, mode: str, on_delta=None):
    """Send with one recycle+retry if the previous turn left the agent busy."""
    await self._cancel_session_run(session, bump=False)
    await asyncio.sleep(0.15)
    opts = SendOptions(on_delta=on_delta, mode=mode) if on_delta is not None else SendOptions(mode=mode)
    try:
      return await session.agent.send(payload, opts)
    except CursorAgentError as err:
      if not self._is_busy_error(err):
        raise
      await self._recycle_agent(session)
      await asyncio.sleep(0.15)
      return await session.agent.send(payload, opts)

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
      turn = session.turn
      try:
        blocked_in = input_block_reason(message)
        if blocked_in:
          return {
            "session_id": session.session_id,
            "reply": blocked_in,
            "status": "cancelled",
            "model": session.model,
          }
        payload, files = build_message(message, attachments, self.settings, session)
        meta = upload_meta(attachments, files)
        run = await self._start_run(session, payload, mode)
        if session.turn != turn:
          await self._cancel_run(run)
          return {
            "session_id": session.session_id,
            "reply": "",
            "status": "cancelled",
            "model": session.model,
            **meta,
          }
        session.active_run = run
        result = await run.wait()
        reply = scrub_reply(await run.text())
        resolved = model_id_from_selection(getattr(result, "model", None))
        out = {
          "session_id": session.session_id,
          "reply": reply,
          "status": result.status,
          "run_id": run.id,
          "agent_id": session.agent.agent_id,
          "model": session.model,
          **resolved_model_payload(resolved),
          **meta,
        }
        terminal = scrub_reply((result.result or "").strip())
        if terminal and not reply:
          out["reply"] = terminal
        if str(result.status).lower() in {"error", "failed"} and terminal:
          out["error"] = friendly_error(terminal)
        return out
      except CursorAgentError as err:
        return {
          "session_id": session.session_id,
          "reply": "",
          "status": "error",
          "error": friendly_error(err.message),
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
      turn = session.turn
      try:
        blocked_in = input_block_reason(message)
        if blocked_in:
          yield sanitize_event({
            "type": "text",
            "session_id": session.session_id,
            "content": blocked_in,
            "model": session.model,
          })
          yield sanitize_event({
            "type": "done",
            "session_id": session.session_id,
            "status": "cancelled",
            "model": session.model,
          })
          return

        payload, files = build_message(message, attachments, self.settings, session)
        meta = upload_meta(attachments, files)
        if meta["images"] or meta["files"]:
          yield sanitize_event({
            "type": "upload",
            "session_id": session.session_id,
            "model": session.model,
            **meta,
          })
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue[dict | None] = asyncio.Queue()

        def on_delta(update) -> None:
          event = sse_from_delta(update, session, self.settings)
          if event:
            loop.call_soon_threadsafe(queue.put_nowait, event)

        run = await self._start_run(session, payload, mode, on_delta=on_delta)
        if session.turn != turn:
          await self._cancel_run(run)
          return
        session.active_run = run
        blocked_msg: str | None = None
        text_acc = ""
        output_secret_blocked = False

        async def forward_messages() -> None:
          try:
            async for event in sse_from_run_messages(run, session, self.settings):
              await queue.put(event)
          finally:
            await queue.put(None)

        forward_task = asyncio.create_task(forward_messages())
        try:
          while True:
            if session.turn != turn:
              await self._cancel_run(run)
              break
            try:
              event = await asyncio.wait_for(queue.get(), timeout=0.25)
            except asyncio.TimeoutError:
              continue
            if event is None:
              break
            block = event.get("repo_write_blocked") if isinstance(event, dict) else None
            if block and not blocked_msg:
              blocked_msg = block
              yield sanitize_event(event)
              yield sanitize_event({
                "type": "text",
                "session_id": session.session_id,
                "content": block,
                "model": session.model,
              })
              try:
                await run.cancel()
              except Exception:
                pass
              break
            if isinstance(event, dict) and event.get("type") in {"text", "thinking", "planning"}:
              chunk = event.get("content") or ""
              if isinstance(chunk, str):
                text_acc += chunk
              if output_secret_blocked:
                continue
              if text_has_secret(text_acc) or (isinstance(chunk, str) and text_has_secret(chunk)):
                output_secret_blocked = True
                yield sanitize_event({
                  "type": "text",
                  "session_id": session.session_id,
                  "content": OUTPUT_BLOCK_SECRET,
                  "model": session.model,
                })
                continue
            yield sanitize_event(event)
        finally:
          if forward_task and not forward_task.done():
            forward_task.cancel()
            try:
              await forward_task
            except asyncio.CancelledError:
              pass

        if blocked_msg:
          yield sanitize_event({
            "type": "done",
            "session_id": session.session_id,
            "status": "cancelled",
            "model": session.model,
          })
          return

        if session.turn != turn:
          return

        result = await run.wait()
        resolved = model_id_from_selection(getattr(result, "model", None))
        terminal = (result.result or "").strip()
        done_evt: dict = {
          "type": "done",
          "session_id": session.session_id,
          "status": result.status,
          "run_id": run.id,
          "agent_id": session.agent.agent_id,
          "model": session.model,
          **resolved_model_payload(resolved),
        }
        if terminal:
          done_evt["result"] = terminal
          if str(result.status).lower() in {"error", "failed"}:
            done_evt["error"] = friendly_error(terminal)
        yield sanitize_event(done_evt)
      except asyncio.CancelledError:
        await self._cancel_run(run)
        raise
      except CursorAgentError as err:
        yield sanitize_event({
          "type": "error",
          "session_id": session.session_id,
          "content": friendly_error(err.message),
          "model": session.model,
        })
      finally:
        if session.active_run is run:
          session.active_run = None
        if run is not None and session.turn != turn:
          await self._cancel_run(run)
        elif run is not None:
          status = getattr(run, "status", None) or "running"
          if status not in _TERMINAL_RUN_STATUSES:
            await self._cancel_run(run)
