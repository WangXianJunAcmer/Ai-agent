"""Owns Cursor bridge, session map, send/stream/cancel. HTTP stays thin."""

from __future__ import annotations

import asyncio
import time
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

from backend.attachments import build_message, prune_upload_dir, upload_meta
from backend.safety import (
    OUTPUT_BLOCK_SECRET,
    input_block_reason,
    sanitize_event,
    scrub_reply,
    set_known_secrets,
    set_safety_enabled,
    text_has_secret,
)
from backend.sessions import Session, model_key
from backend.tool_display import (
    dedupe_cumulative,
    friendly_error,
    model_id_from_selection,
    resolved_model_payload,
    sse_from_delta,
    sse_from_run_messages,
)

_TERMINAL_RUN_STATUSES = frozenset({"finished", "error", "cancelled", "expired"})
# Idle sessions (no pump, live_done) older than this are closed + dropped.
_SESSION_IDLE_TTL_SEC = 3600


class SessionManager:
    def __init__(self, settings: dict):
        self.settings = settings
        self._stack = AsyncExitStack()
        self._client: AsyncClient | None = None
        self._sessions: dict[str, Session] = {}
        self._started = False
        self._map_lock = asyncio.Lock()
        # Keep strong refs so request disconnect cannot GC / drop pumps.
        self._background_tasks: set[asyncio.Task] = set()
        set_safety_enabled(bool(settings.get("safety_enabled", True)))
        set_known_secrets(str(settings.get("api_key") or ""))

    async def start(self) -> None:
        if self._started:
            return
        set_safety_enabled(bool(self.settings.get("safety_enabled", True)))
        set_known_secrets(str(self.settings.get("api_key") or ""))
        host_root = str(self.settings["host_root"])
        prune_upload_dir(host_root)
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

    def _touch(self, session: Session) -> None:
        session.last_active = time.time()

    def _session_is_busy(self, session: Session) -> bool:
        return self._pump_running(session) or not session.live_done or session.active_run is not None

    async def _prune_idle_sessions(self) -> None:
        """Drop finished sessions idle longer than TTL. Never touches a live pump."""
        now = time.time()
        stale_ids = [
            sid
            for sid, session in self._sessions.items()
            if not self._session_is_busy(session)
            and session.last_active
            and (now - session.last_active) > _SESSION_IDLE_TTL_SEC
        ]
        for sid in stale_ids:
            session = self._sessions.pop(sid, None)
            if session is None:
                continue
            await self._close_agent(session.agent)

    async def get_or_create(self, session_id: str | None, model: str | dict | None = None) -> Session:
        await self.start()
        if isinstance(model, dict):
            selected_model = str(model.get("id") or self.settings["model"])
            model_selection = model
        else:
            selected_model = model or self.settings["model"]
            model_selection = model or self.settings["model"]
        key = model_key(model_selection)

        async with self._map_lock:
            await self._prune_idle_sessions()
            if session_id and session_id in self._sessions:
                session = self._sessions[session_id]
                if session.model_key == key:
                    self._touch(session)
                    return session
                # Wait out in-flight turn before swapping the agent (avoids dual agents on one id).
                async with session.lock:
                    current = self._sessions.get(session_id)
                    if current is not None and current.model_key == key:
                        self._touch(current)
                        return current
                    if current is not None:
                        await self._cancel_session_run(current, bump=False)
                        await self._close_agent(current.agent)
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
                last_active=time.time(),
            )
            existing = self._sessions.get(sid)
            if existing is not None and existing.model_key == key:
                await self._close_agent(agent)
                self._touch(existing)
                return existing
            self._sessions[sid] = session
            return session

    def _agent_options(self, model: str | dict):
        settings = self.settings
        model_id = model.get("id") if isinstance(model, dict) else model
        label = model_id or settings["model"]
        opts: dict = {
            "model": model,
            "api_key": settings["api_key"],
            "name": f"Ai-agent ({label})",
        }
        if settings["runtime"] == "cloud":
            if not settings["cloud_repo_url"]:
                raise RuntimeError("agent.runtime is cloud but agent.cloud.repo_url is empty")
            opts["cloud"] = CloudAgentOptions(
                repos=[CloudRepository(url=settings["cloud_repo_url"], starting_ref=settings["cloud_starting_ref"])],
                auto_create_pr=settings["cloud_auto_create_pr"],
            )
        else:
            opts["local"] = LocalAgentOptions(cwd=str(settings["host_root"]))
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
        self._touch(session)
        async with session.lock:
            run = None
            turn = session.turn
            try:
                blocked = input_block_reason(message)
                if blocked:
                    return {
                        "session_id": session.session_id,
                        "reply": blocked,
                        "status": "cancelled",
                        "model": session.model,
                    }
                payload, files = build_message(message, attachments, self.settings, session)
                meta = upload_meta(attachments, files)
                run = await self._start_run(session, payload, mode)
                if session.turn != turn:
                    await self._cancel_run(run)
                    return self._cancelled_send(session, **meta)
                session.active_run = run
                result = await run.wait()
                if session.turn != turn:
                    await self._cancel_run(run)
                    return self._cancelled_send(session, **meta)
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
            except (CursorAgentError, RuntimeError) as err:
                msg = getattr(err, "message", None) or str(err)
                return {
                    "session_id": session.session_id,
                    "reply": "",
                    "status": "error",
                    "error": friendly_error(msg),
                    "model": session.model,
                }
            finally:
                if session.active_run is run:
                    session.active_run = None

    def session_status(self, session_id: str | None) -> dict:
        if not session_id or session_id not in self._sessions:
            return {"ok": False, "running": False, "events": 0}
        session = self._sessions[session_id]
        return {
            "ok": True,
            "running": self._pump_running(session) or not session.live_done,
            "events": len(session.live_events),
            "live_done": session.live_done,
        }

    def find_running_session(self) -> Session | None:
        """Single-user fallback when refresh lost the session id mid-flight."""
        for session in self._sessions.values():
            if self._pump_running(session):
                return session
            if not session.live_done and session.live_events:
                return session
        return None

    def _spawn_pump(self, coro) -> asyncio.Task:
        task = asyncio.create_task(coro)
        self._background_tasks.add(task)
        task.add_done_callback(self._background_tasks.discard)
        return task

    def _pump_running(self, session: Session) -> bool:
        task = session.pump_task
        return task is not None and not task.done()

    def _emit(self, session: Session, event: dict) -> dict:
        clean = sanitize_event(event)
        session.live_events.append(clean)
        return clean

    def _emit_done(self, session: Session, status: str, **extra) -> dict:
        return self._emit(session, {
            "type": "done",
            "session_id": session.session_id,
            "status": status,
            "model": session.model,
            **extra,
        })

    def _emit_error(self, session: Session, content: str) -> dict:
        return self._emit(session, {
            "type": "error",
            "session_id": session.session_id,
            "content": friendly_error(content),
            "model": session.model,
        })

    def _cancelled_send(self, session: Session, **extra) -> dict:
        return {
            "session_id": session.session_id,
            "reply": "",
            "status": "cancelled",
            "model": session.model,
            **extra,
        }

    async def _follow_log(self, session: Session, start_idx: int = 0) -> AsyncIterator[dict]:
        """Subscribe to live_events. Cancelling this iterator does NOT stop the pump."""
        # ponytail: same poll as ad-plex; waiter queues if fan-out latency matters
        idx = max(0, int(start_idx or 0))
        while True:
            while idx < len(session.live_events):
                event = session.live_events[idx]
                idx += 1
                yield event
            if not self._pump_running(session):
                while idx < len(session.live_events):
                    event = session.live_events[idx]
                    idx += 1
                    yield event
                # Empty buffer, or client already has every event — close SSE so refresh doesn't hang.
                if idx == 0 or (start_idx >= len(session.live_events) and session.live_done):
                    yield sanitize_event({
                        "type": "done",
                        "session_id": session.session_id,
                        "status": "finished",
                        "model": session.model,
                    })
                return
            await asyncio.sleep(0.1)

    async def _stop_pump(self, session: Session) -> None:
        task = session.pump_task
        if not task or task.done():
            return
        try:
            await asyncio.wait_for(asyncio.shield(task), timeout=8)
        except Exception:
            task.cancel()
            try:
                await task
            except Exception:
                pass

    async def _launch_turn(
        self,
        session: Session,
        message: str,
        mode: str,
        attachments: list[dict] | None,
    ) -> None:
        async with session.lock:
            if session.pump_task and not session.pump_task.done():
                await self._cancel_session_run(session, bump=True)
                await self._stop_pump(session)
            session.live_events = []
            session.live_done = False
            # Buffer session_id before pump awaits Cursor — refresh can /follow immediately.
            self._emit(session, {
                "type": "status",
                "session_id": session.session_id,
                "status": "started",
                "content": "started",
                "model": session.model,
            })
            turn = session.turn
            # Detached from the HTTP request cancel scope so refresh cannot kill the run.
            session.pump_task = self._spawn_pump(
                self._pump_turn(session, message, mode, attachments, turn)
            )

    async def _pump_turn(
        self,
        session: Session,
        message: str,
        mode: str,
        attachments: list[dict] | None,
        turn: int,
    ) -> None:
        """Run Cursor turn in the background; buffer events for stream + follow."""
        run = None
        forward_task = None
        try:
            input_block = input_block_reason(message)
            if input_block:
                self._emit(session, {
                    "type": "text",
                    "session_id": session.session_id,
                    "content": input_block,
                    "model": session.model,
                })
                self._emit_done(session, "cancelled")
                return

            payload, files = build_message(message, attachments, self.settings, session)
            meta = upload_meta(attachments, files)
            if meta["images"] or meta["files"]:
                self._emit(session, {
                    "type": "upload",
                    "session_id": session.session_id,
                    "model": session.model,
                    **meta,
                })
            event_queue: asyncio.Queue[dict | None] = asyncio.Queue()

            def on_delta(update) -> None:
                # Same asyncio task as run.messages() — put_nowait keeps delta→assistant
                # order. call_soon_threadsafe deferred deltas and let cumulative assistant
                # snapshots win the race → duplicated reply ("你好你好" / "正在正在").
                try:
                    event = sse_from_delta(update, session, self.settings)
                except Exception as exc:
                    event = {
                        "type": "error",
                        "session_id": session.session_id,
                        "content": friendly_error(str(exc)),
                        "model": session.model,
                    }
                if event:
                    event_queue.put_nowait(event)

            run = await self._start_run(session, payload, mode, on_delta=on_delta)
            if session.turn != turn:
                await self._cancel_run(run)
                self._emit_done(session, "cancelled")
                return
            session.active_run = run
            write_block_notice: str | None = None
            reply_so_far = ""
            text_so_far = ""
            thinking_so_far = ""
            secret_in_output = False

            async def forward_messages() -> None:
                try:
                    async for event in sse_from_run_messages(run, session, self.settings):
                        await event_queue.put(event)
                except Exception as exc:
                    await event_queue.put({
                        "type": "error",
                        "session_id": session.session_id,
                        "content": friendly_error(str(exc)),
                        "model": session.model,
                    })
                finally:
                    await event_queue.put(None)

            forward_task = asyncio.create_task(forward_messages())
            try:
                while True:
                    if session.turn != turn:
                        await self._cancel_run(run)
                        break
                    try:
                        event = await asyncio.wait_for(event_queue.get(), timeout=0.25)
                    except asyncio.TimeoutError:
                        continue
                    if event is None:
                        break
                    write_block = event.get("repo_write_blocked") if isinstance(event, dict) else None
                    if write_block and not write_block_notice:
                        write_block_notice = write_block
                        self._emit(session, event)
                        self._emit(session, {
                            "type": "text",
                            "session_id": session.session_id,
                            "content": write_block,
                            "model": session.model,
                        })
                        try:
                            await run.cancel()
                        except Exception:
                            pass
                        break
                    if isinstance(event, dict) and event.get("type") in {"text", "thinking", "planning"}:
                        chunk = event.get("content") or ""
                        if not isinstance(chunk, str):
                            chunk = str(chunk) if chunk else ""
                        # SDK assistant/thinking messages are full snapshots; text-delta is incremental.
                        if event.get("cumulative"):
                            if event["type"] == "text":
                                text_so_far, chunk = dedupe_cumulative(text_so_far, chunk)
                            elif event["type"] == "thinking":
                                thinking_so_far, chunk = dedupe_cumulative(thinking_so_far, chunk)
                            if not chunk and not event.get("completed"):
                                continue
                            event = {**event, "content": chunk}
                        elif chunk:
                            if event["type"] == "text":
                                text_so_far += chunk
                            elif event["type"] == "thinking":
                                thinking_so_far += chunk
                        if chunk:
                            reply_so_far += chunk
                        if event.get("completed") and not chunk:
                            self._emit(session, event)
                            continue
                        if secret_in_output:
                            continue
                        # ponytail: 按 chunk 检测会漏跨片密钥前缀；真 DLP 要 holdback 或 SDK sandbox。
                        if text_has_secret(reply_so_far) or (chunk and text_has_secret(chunk)):
                            secret_in_output = True
                            self._emit(session, {
                                "type": "text",
                                "session_id": session.session_id,
                                "content": OUTPUT_BLOCK_SECRET,
                                "model": session.model,
                            })
                            continue
                    self._emit(session, event)
            finally:
                if forward_task and not forward_task.done():
                    forward_task.cancel()
                    try:
                        await forward_task
                    except asyncio.CancelledError:
                        pass
                elif forward_task is not None:
                    # Surface parse/stream failures that already finished the task.
                    try:
                        exc = forward_task.exception()
                    except (asyncio.CancelledError, asyncio.InvalidStateError):
                        exc = None
                    if exc is not None:
                        self._emit_error(session, str(exc))

            if write_block_notice or session.turn != turn:
                self._emit_done(session, "cancelled")
                return

            result = await run.wait()
            if session.turn != turn:
                self._emit_done(session, "cancelled")
                return
            status = getattr(result, "status", None) or "finished"
            if str(status).lower() in {"error", "failed"}:
                err_msg = (
                    getattr(result, "error", None)
                    or getattr(result, "message", None)
                    or getattr(result, "result", None)
                    or "Agent 执行失败"
                )
                self._emit_error(session, str(err_msg))
            resolved = model_id_from_selection(getattr(result, "model", None))
            terminal = scrub_reply((result.result or "").strip())
            if secret_in_output and terminal and terminal != OUTPUT_BLOCK_SECRET:
                terminal = OUTPUT_BLOCK_SECRET
            done_extra: dict = {
                "run_id": run.id,
                "agent_id": session.agent.agent_id,
                **resolved_model_payload(resolved),
            }
            if terminal:
                done_extra["result"] = terminal
                if str(status).lower() in {"error", "failed"}:
                    done_extra["error"] = friendly_error(terminal)
            self._emit_done(session, status, **done_extra)
        except asyncio.CancelledError:
            # Match ad-plex: only cancel Cursor run on turn bump, not on subscriber cancel.
            if session.turn != turn:
                await self._cancel_run(run)
            raise
        except (CursorAgentError, RuntimeError) as err:
            msg = getattr(err, "message", None) or str(err)
            self._emit_error(session, msg)
            self._emit_done(session, "error")
        finally:
            if session.active_run is run:
                session.active_run = None
            # Only cancel on turn mismatch — never because an SSE client disconnected.
            if run is not None and session.turn != turn:
                await self._cancel_run(run)
            session.live_done = True

    async def stream(
        self,
        session_id: str | None,
        message: str,
        model: str | dict | None = None,
        mode: str = "agent",
        attachments: list[dict] | None = None,
    ) -> AsyncIterator[dict]:
        session = await self.get_or_create(session_id, model)
        self._touch(session)
        await self._launch_turn(session, message, mode, attachments)
        # Follow outside launch so refresh/follow can subscribe in parallel.
        try:
            async for event in self._follow_log(session, 0):
                yield event
        except asyncio.CancelledError:
            # Client refresh/disconnect — pump keeps running for /follow.
            return

    async def follow(
        self,
        session_id: str | None,
        after: int = 0,
    ) -> AsyncIterator[dict]:
        session = self._sessions.get(session_id) if session_id else None
        if session is None:
            session = self.find_running_session()
        if session is None:
            yield sanitize_event({
                "type": "done",
                "session_id": session_id or "",
                "status": "expired",
            })
            return
        self._touch(session)
        start = max(0, int(after or 0))
        try:
            async for event in self._follow_log(session, start):
                yield event
        except asyncio.CancelledError:
            return
