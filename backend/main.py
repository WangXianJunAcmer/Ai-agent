"""FastAPI sidecar: Cursor SDK agent + embeddable chat widget."""

from __future__ import annotations

import json
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from cursor_sdk import Cursor
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.config import load_settings
from backend.sessions import SessionManager

settings = load_settings()
sessions = SessionManager(settings)
DEFAULT_MODEL_OPTIONS = ["composer-2.5", "auto"]


def get_model_options() -> list[str]:
    try:
        models = Cursor.models.list(api_key=settings["api_key"])
        options = ["auto"]
        ids = sorted({getattr(model, "id", "") for model in models if getattr(model, "id", "")})
        options.extend(model_id for model_id in ids if model_id != "auto")
        return options or DEFAULT_MODEL_OPTIONS
    except Exception:
        return DEFAULT_MODEL_OPTIONS


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await sessions.start()
    yield
    await sessions.stop()


app = FastAPI(title="Ai-agent", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
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
    images: list[AttachmentPayload] | None = None
    files: list[AttachmentPayload] | None = None

    def prompt_text(self) -> str:
        return (self.message or self.text or "").strip()

    def attachments(self) -> list[AttachmentPayload]:
        return list(self.files or []) + list(self.images or [])


@app.get("/")
async def index():
    return FileResponse(frontend_dir / "index.html")


@app.get("/favicon.ico")
async def favicon():
    return Response(status_code=204)


@app.get("/api/health")
async def health():
    return {
        "ok": True,
        "host_root": str(settings["host_root"]),
        "runtime": settings["runtime"],
        "model": settings["model"],
        "default_model": settings["model"],
        "model_options": get_model_options(),
    }


def _attachments_payload(items: list[AttachmentPayload] | None) -> list[dict] | None:
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


@app.post("/api/chat")
async def chat(req: ChatRequest):
    prompt = req.prompt_text()
    attachments = _attachments_payload(req.attachments())
    if not prompt and not attachments:
        raise HTTPException(status_code=422, detail="message/text or files/images is required")
    result = await sessions.send(req.session_id, prompt, req.model, attachments)
    if result.get("status") == "error" and "error" in result:
        raise HTTPException(status_code=502, detail=result["error"])
    return result


@app.post("/api/chat/stream")
async def chat_stream(req: ChatRequest):
    prompt = req.prompt_text()
    attachments = _attachments_payload(req.attachments())
    if not prompt and not attachments:
        raise HTTPException(status_code=422, detail="message/text or files/images is required")

    async def event_gen():
        async for event in sessions.stream(req.session_id, prompt, req.model, attachments):
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_gen(), media_type="text/event-stream")


frontend_dir = ROOT / "frontend"
frontend_dir.mkdir(exist_ok=True)
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
