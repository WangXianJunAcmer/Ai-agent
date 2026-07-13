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
from fastapi.responses import FileResponse, Response, StreamingResponse
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
            event = await asyncio.to_thread(out.get)
            if event is None:
                break
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
    finally:
        def _cancel_follow() -> None:
            task = aio_box[0]
            if task is not None and not task.done():
                task.cancel()

        loop.call_soon_threadsafe(_cancel_follow)


def _resolve_model(model_id: str | None) -> str | dict:
    """Warm catalog once if empty, then expand id → SDK model selection."""
    get_model_options(settings["api_key"])  # no-op when already cached
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
    images: list[AttachmentPayload] | None = None
    files: list[AttachmentPayload] | None = None

    def prompt_text(self) -> str:
        return (self.message or self.text or "").strip()

    def attachment_list(self) -> list[AttachmentPayload]:
        return list(self.files or []) + list(self.images or [])

    def resolved_mode(self) -> str:
        return self.mode if self.mode in {"agent", "plan"} else "agent"


class CancelRequest(BaseModel):
    session_id: str | None = None


class FollowRequest(BaseModel):
    session_id: str | None = None
    after: int = 0


frontend_dir = ROOT / "frontend"
frontend_dir.mkdir(exist_ok=True)


@app.get("/")
async def index():
    options = get_model_options(settings["api_key"])
    cache_json = json.dumps(options, ensure_ascii=False).replace("<", "\\u003c")
    selected = settings.get("model", "composer-2.5")
    option_html = "\n".join(
        (
            f'<option value="{html.escape(str(item["id"]), quote=True)}"'
            f'{" selected" if item["id"] == selected else ""}>'
            f'{html.escape(str(item.get("display_name") or item["id"]))}</option>'
        )
        for item in options
    )
    page = (frontend_dir / "index.html").read_text(encoding="utf-8")
    page = page.replace("__AI_AGENT_MODEL_CACHE__", cache_json)
    page = page.replace("__AI_AGENT_MODEL_OPTIONS__", option_html)
    return Response(page, media_type="text/html; charset=utf-8")


@app.get("/favicon.ico")
async def favicon():
    return Response(status_code=204)


@app.get("/api/health")
async def health():
    return {
        "ok": True,
        "boot_id": BOOT_ID,
        "host_root": str(settings["host_root"]),
        "runtime": settings["runtime"],
        "model": settings["model"],
        "allow_repo_write": settings.get("allow_repo_write", True),
        "safety_enabled": settings.get("safety_enabled", True),
        "model_options": get_model_options(settings["api_key"]),
    }


@app.get("/api/models/refresh")
async def refresh_models():
    """Hit Cursor.models.list (off the event loop) and report whether the catalog changed."""
    before = get_model_options(settings["api_key"])
    after = await asyncio.to_thread(
        get_model_options, settings["api_key"], refresh=True
    )
    return {
        "changed": after != before,
        "model_options": after,
    }


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


def _parse_chat(req: ChatRequest) -> tuple[str, list[dict] | None, str | dict, str]:
    prompt = req.prompt_text()
    attachments = _attachment_dicts(req.attachment_list())
    if not prompt and not attachments:
        raise HTTPException(status_code=422, detail="message/text or files/images is required")
    return prompt, attachments, _resolve_model(req.model), req.resolved_mode()


@app.post("/api/chat")
async def chat(req: ChatRequest):
    prompt, attachments, model, mode = _parse_chat(req)
    result = await _worker_await(
        sessions.send(req.session_id, prompt, model, mode, attachments)
    )
    if result.get("status") == "error" and "error" in result:
        raise HTTPException(status_code=502, detail=result["error"])
    return result


@app.post("/api/chat/cancel")
async def cancel_chat(req: CancelRequest):
    await _worker_await(sessions.cancel(req.session_id))
    return {"ok": True}


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
    prompt, attachments, model, mode = _parse_chat(req)

    async def event_gen():
        async for chunk in _sse_from_worker(
            lambda: sessions.stream(req.session_id, prompt, model, mode, attachments)
        ):
            yield chunk

    return StreamingResponse(event_gen(), media_type="text/event-stream")


@app.get("/static/widget.js")
async def widget_js():
    # Avoid sticky browser cache during local reload (restore / edit UX).
    return FileResponse(
        frontend_dir / "widget.js",
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
    uvicorn.run(
        "backend.main:app",
        host=host,
        port=port,
        reload=settings["reload"],
        reload_dirs=[str(ROOT)],
    )


if __name__ == "__main__":
    main()
