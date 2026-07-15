"""FastAPI sidecar: Cursor SDK agent + embeddable chat widget."""

from __future__ import annotations

import asyncio
import html
import json
import queue
import sys
import threading
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator, Callable

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.config import load_settings
from backend.model_catalog import get_model_options, resolve_model_selection
from backend.runtime import SessionManager

settings = load_settings()
sessions = SessionManager(settings)
# Changes on every process start so clients can drop stale chat UI after restart.
# Widget compares this with localStorage bootId: mismatch → session/follow is dead.
BOOT_ID = uuid.uuid4().hex

# Dedicated loop for pumps (ad-plex pattern): HTTP cancel must not kill the turn.
_worker_loop: asyncio.AbstractEventLoop | None = None
_worker_lock = threading.Lock()


def _ensure_worker_loop() -> asyncio.AbstractEventLoop:
    global _worker_loop
    with _worker_lock:
        if _worker_loop is not None:
            return _worker_loop
        loop = asyncio.new_event_loop()

        def _run() -> None:
            asyncio.set_event_loop(loop)
            loop.run_forever()

        threading.Thread(target=_run, name="ai-agent-runtime", daemon=True).start()
        _worker_loop = loop
        return loop


async def _worker_await(coro):
    loop = _ensure_worker_loop()
    return await asyncio.wrap_future(asyncio.run_coroutine_threadsafe(coro, loop))


async def _sse_from_worker(factory: Callable[[], AsyncIterator[dict]]) -> AsyncIterator[str]:
    """Bridge worker-loop async iterator → uvicorn SSE. Cancel only stops this follower."""
    loop = _ensure_worker_loop()
    out: queue.Queue = queue.Queue()
    # ponytail: box+Event so finally can cancel even if start races disconnect (ad-plex)
    aio_box: list[asyncio.Future | None] = [None]
    started = threading.Event()
    # Keep proxies/browsers from killing long-thinking streams (no agent events for a while).
    _HEARTBEAT_SEC = 15.0

    async def _produce() -> None:
        try:
            async for event in factory():
                out.put(event)
        except asyncio.CancelledError:
            return
        except Exception as exc:
            out.put({"type": "error", "content": str(exc)})
        finally:
            out.put(None)

    def _start() -> None:
        aio_box[0] = asyncio.ensure_future(_produce(), loop=loop)
        started.set()

    loop.call_soon_threadsafe(_start)
    started.wait(timeout=5)
    try:
        while True:
            try:
                event = await asyncio.to_thread(out.get, True, _HEARTBEAT_SEC)
            except queue.Empty:
                # SSE comment — ignored by EventSource/fetch parsers; keeps the socket warm.
                yield ": ping\n\n"
                continue
            if event is None:
                break
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
    finally:
        def _cancel_follow() -> None:
            task = aio_box[0]
            if task is not None and not task.done():
                task.cancel()

        loop.call_soon_threadsafe(_cancel_follow)


def _resolve_model(model_id: str | None, *, provider: str = "cursor") -> str | dict:
    """Warm catalog once if empty, then expand id → SDK model selection (Cursor only)."""
    from backend.providers import COMPAT_PROVIDERS

    if provider in COMPAT_PROVIDERS:
        from backend.providers.compat_agent import default_model

        mid = (model_id or "").strip() or default_model(provider)
        return mid
    from backend.config import cursor_api_key

    get_model_options(cursor_api_key(settings))
    return resolve_model_selection(model_id, settings.get("model", "composer-2.5"))


@asynccontextmanager
async def lifespan(_app: FastAPI):
    _ensure_worker_loop()
    await _worker_await(sessions.start())
    yield
    await _worker_await(sessions.stop())


app = FastAPI(title="Ai-agent", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,  # * + credentials is invalid CORS
    allow_methods=["*"],
    allow_headers=["*"],
)


class AttachmentPayload(BaseModel):
    data: str = Field(description="Base64-encoded file data (no data: prefix)")
    mime_type: str = Field(description="MIME type, e.g. image/png or text/plain")
    name: str | None = None


class ChatRequest(BaseModel):
    message: str | None = None
    text: str | None = None
    session_id: str | None = None
    model: str | None = None
    mode: str | None = None
    # cursor | openai | deepseek — omitted → config.yaml agent.provider
    provider: str | None = None
    # DeepSeek thinking mode (ignored for other providers). Default off when omitted.
    thinking: bool | None = None
    reasoning_effort: str | None = None  # high | max (aliases mapped server-side)
    images: list[AttachmentPayload] | None = None
    files: list[AttachmentPayload] | None = None

    def prompt_text(self) -> str:
        return (self.message or self.text or "").strip()

    def attachment_list(self) -> list[AttachmentPayload]:
        return list(self.files or []) + list(self.images or [])

    def resolved_mode(self) -> str:
        return self.mode if self.mode in {"agent", "plan"} else "agent"

    def resolved_provider(self) -> str:
        from backend.providers import normalize_provider

        return normalize_provider(self.provider or settings.get("provider"))

    def deepseek_thinking(self) -> tuple[bool | None, str | None]:
        """Return (thinking, effort) for DeepSeek; (None, None) otherwise.

        effort is only set when the client explicitly sends reasoning_effort.
        Otherwise omit it — API defaults high, auto-max for Agent/tool turns.
        """
        if self.resolved_provider() != "deepseek":
            return None, None
        from backend.providers.compat_agent import normalize_reasoning_effort

        # Match UI pill default (off) and stream_compat_turn when thinking is omitted.
        on = False if self.thinking is None else bool(self.thinking)
        effort = normalize_reasoning_effort(self.reasoning_effort) if on else None
        return on, effort



class CancelRequest(BaseModel):
    session_id: str | None = None


class UndoRequest(BaseModel):
    session_id: str | None = None
    turn_id: str | None = None
    path: str | None = None  # set → undo one file; omit → undo all


class FollowRequest(BaseModel):
    session_id: str | None = None
    after: int = 0


frontend_dir = ROOT / "frontend"
frontend_dir.mkdir(exist_ok=True)

# Source parts under frontend/js/; /static/widget.js stays the embed URL.
_JS_PARTS = (
    "shell.js",
    "chrome.js",
    "markdown.js",
    "thread.js",
    "runtime.js",
)


def build_widget_js() -> str:
    """Concatenate frontend/js parts in order (single IIFE across files)."""
    js_dir = frontend_dir / "js"
    chunks: list[str] = []
    for name in _JS_PARTS:
        path = js_dir / name
        if not path.is_file():
            raise FileNotFoundError(f"missing js part: {path}")
        chunks.append(path.read_text(encoding="utf-8"))
    # ponytail: wrap here so each part is valid JS alone (IDE/node --check); shared scope still one IIFE.
    return "(function () {\n" + "\n".join(chunks) + "\n})();\n"


def _inject_page(name: str, *, provider: str = "cursor") -> Response:
    """Serve an HTML page with model catalog placeholders filled."""
    from backend.config import cursor_api_key
    from backend.providers import COMPAT_PROVIDERS
    from backend.providers.compat_agent import default_model, model_options

    if provider in COMPAT_PROVIDERS:
        options = model_options(provider)
        selected = default_model(provider)
    else:
        options = get_model_options(cursor_api_key(settings))
        selected = str(settings.get("model", "composer-2.5"))
    cache_json = json.dumps(options, ensure_ascii=False).replace("<", "\\u003c")
    page = (frontend_dir / name).read_text(encoding="utf-8")
    page = page.replace("__AI_AGENT_MODEL_CACHE__", cache_json)
    page = page.replace("__AI_AGENT_DEFAULT_MODEL__", html.escape(selected, quote=True))
    page = page.replace("__AI_AGENT_PROVIDER__", html.escape(provider, quote=True))
    return Response(page, media_type="text/html; charset=utf-8")


@app.get("/")
async def index():
    return _inject_page("index.html")


@app.get("/cursor")
async def cursor_page():
    """Dedicated Cursor fullscreen chat (no floating sidebar trigger)."""
    return _inject_page("cursor.html", provider="cursor")


@app.get("/openai")
async def openai_page():
    if not settings.get("openai_api_key"):
        raise HTTPException(
            status_code=503,
            detail="OPENAI_API_KEY is not set. Add it to .env and restart.",
        )
    return _inject_page("openai.html", provider="openai")


@app.get("/deepseek")
async def deepseek_page():
    if not settings.get("deepseek_api_key"):
        raise HTTPException(
            status_code=503,
            detail="DEEPSEEK_API_KEY is not set. Add it to .env and restart.",
        )
    return _inject_page("deepseek.html", provider="deepseek")


@app.get("/favicon.ico")
async def favicon():
    return Response(status_code=204)


@app.get("/api/health")
async def health():
    from backend.config import cursor_api_key
    from backend.providers import COMPAT_PROVIDERS, describe_provider
    from backend.providers.compat_agent import model_options

    prov = settings.get("provider") or "cursor"
    if prov in COMPAT_PROVIDERS:
        catalog = model_options(prov)
    else:
        catalog = get_model_options(cursor_api_key(settings))

    return {
        "ok": True,
        "boot_id": BOOT_ID,
        "host_root": str(settings["host_root"]),
        **describe_provider(settings),
        "runtime": settings["runtime"],
        "model": settings["model"],
        "allow_repo_write": settings.get("allow_repo_write", True),
        "safety_enabled": settings.get("safety_enabled", True),
        # Booleans only — never echo secret values.
        "keys": {
            "cursor": bool(settings.get("cursor_api_key")),
            "openai": bool(settings.get("openai_api_key")),
            "deepseek": bool(settings.get("deepseek_api_key")),
        },
        "model_options": catalog,
    }


@app.get("/api/models/refresh")
async def refresh_models(provider: str = "cursor"):
    """Refresh model catalog. Cursor hits remote list; OpenAI/DeepSeek return static lists."""
    from backend.config import cursor_api_key
    from backend.providers import COMPAT_PROVIDERS, normalize_provider
    from backend.providers.compat_agent import model_options

    prov = normalize_provider(provider)
    if prov in COMPAT_PROVIDERS:
        options = model_options(prov)
        return {"changed": False, "model_options": options, "provider": prov}
    key = cursor_api_key(settings)
    before = get_model_options(key)
    after = await asyncio.to_thread(get_model_options, key, refresh=True)
    return {
        "changed": after != before,
        "model_options": after,
        "provider": "cursor",
    }


@app.get("/api/skills")
async def api_skills():
    """Project skills under host_root (.cursor/.agents/.claude/.codex)."""
    from backend.skills import list_project_skills

    skills = await asyncio.to_thread(list_project_skills, settings["host_root"])
    return {"skills": skills, "host_root": str(settings["host_root"])}


def _attachment_dicts(items: list[AttachmentPayload] | None) -> list[dict] | None:
    if not items:
        return None
    return [
        {
            "data": item.data,
            "mime_type": item.mime_type or "application/octet-stream",
            "name": item.name or "file",
        }
        for item in items
    ]


def _parse_chat(req: ChatRequest) -> tuple[str, list[dict] | None, str | dict, str, str]:
    prompt = req.prompt_text()
    attachments = _attachment_dicts(req.attachment_list())
    if not prompt and not attachments:
        raise HTTPException(status_code=422, detail="message/text or files/images is required")
    provider = req.resolved_provider()
    return (
        prompt,
        attachments,
        _resolve_model(req.model, provider=provider),
        req.resolved_mode(),
        provider,
    )


@app.post("/api/chat")
async def chat(req: ChatRequest):
    prompt, attachments, model, mode, provider = _parse_chat(req)
    thinking, effort = req.deepseek_thinking()
    result = await _worker_await(
        sessions.send(
            req.session_id,
            prompt,
            model,
            mode,
            attachments,
            provider=provider,
            thinking=thinking,
            reasoning_effort=effort,
        )
    )
    if result.get("status") == "error" and "error" in result:
        raise HTTPException(status_code=502, detail=result["error"])
    return result


@app.post("/api/chat/cancel")
async def cancel_chat(req: CancelRequest):
    await _worker_await(sessions.cancel(req.session_id))
    return {"ok": True}


@app.post("/api/chat/undo")
async def undo_chat(req: UndoRequest):
    """Undo file changes from a tracked agent turn (OpenAI / DeepSeek)."""
    if not req.session_id or not req.turn_id:
        raise HTTPException(status_code=422, detail="session_id and turn_id are required")
    result = await _worker_await(
        sessions.undo_turn(req.session_id, req.turn_id, path=req.path)
    )
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("error") or "undo failed")
    return result


@app.get("/api/chat/status")
async def chat_status(session_id: str = ""):
    async def _get():
        return sessions.session_status(session_id or None)

    return await _worker_await(_get())


@app.post("/api/chat/follow")
async def chat_follow(req: FollowRequest):
    """Replay + continue a detached turn after refresh (ChatGPT-style)."""

    async def event_gen():
        async for chunk in _sse_from_worker(
            lambda: sessions.follow(req.session_id, req.after)
        ):
            yield chunk

    return StreamingResponse(event_gen(), media_type="text/event-stream")


@app.post("/api/chat/stream")
async def chat_stream(req: ChatRequest):
    prompt, attachments, model, mode, provider = _parse_chat(req)
    thinking, effort = req.deepseek_thinking()

    async def event_gen():
        async for chunk in _sse_from_worker(
            lambda: sessions.stream(
                req.session_id,
                prompt,
                model,
                mode,
                attachments,
                provider=provider,
                thinking=thinking,
                reasoning_effort=effort,
            )
        ):
            yield chunk

    return StreamingResponse(event_gen(), media_type="text/event-stream")


@app.get("/static/widget.js")
async def widget_js():
    # Avoid sticky browser cache during local reload (restore / edit UX).
    try:
        body = build_widget_js()
    except FileNotFoundError as err:
        raise HTTPException(status_code=500, detail=str(err)) from err
    return Response(
        body,
        media_type="application/javascript; charset=utf-8",
        headers={"Cache-Control": "no-cache, must-revalidate"},
    )


app.mount("/static", StaticFiles(directory=str(frontend_dir)), name="static")


def _lan_ip() -> str | None:
    """Best-effort primary LAN IPv4 (same idea as Flask's startup banner)."""
    import socket

    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            return sock.getsockname()[0]
    except OSError:
        return None


def _print_urls(host: str, port: int) -> None:
    print(f" * Running on http://127.0.0.1:{port}")
    if host in ("0.0.0.0", "::"):
        lan = _lan_ip()
        if lan and lan not in ("127.0.0.1", "::1"):
            print(f" * Running on http://{lan}:{port}")
    elif host not in ("127.0.0.1", "localhost"):
        print(f" * Running on http://{host}:{port}")


def _quiet_uvicorn_bind_log() -> None:
    """Drop uvicorn's 'Uvicorn running on http://0.0.0.0:...' line (misleading)."""
    import logging

    class _DropBindUrl(logging.Filter):
        def filter(self, record: logging.LogRecord) -> bool:
            msg = record.getMessage()
            return "Uvicorn running on http://" not in msg and "Uvicorn running on https://" not in msg

    logging.getLogger("uvicorn.error").addFilter(_DropBindUrl())


def main():
    import uvicorn

    host = settings["host"]
    port = settings["port"]
    _quiet_uvicorn_bind_log()
    _print_urls(host, port)
    # reload=True is unsafe for this service: the WatchFiles parent keeps its
    # initial watch set for the whole process lifetime, and agent file writes
    # under cwd kill mid-turn SSE. Prefer a manual restart while developing.
    run_kwargs = {
        "app": "backend.main:app",
        "host": host,
        "port": port,
        "reload": bool(settings["reload"]),
    }
    if settings["reload"]:
        run_kwargs["reload_dirs"] = [str(ROOT / "backend"), str(ROOT / "frontend")]
    uvicorn.run(**run_kwargs)


if __name__ == "__main__":
    main()
