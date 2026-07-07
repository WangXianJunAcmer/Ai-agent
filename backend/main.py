"""FastAPI sidecar: Cursor SDK agent + embeddable chat widget."""

from __future__ import annotations

import json
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.config import load_settings
from backend.sessions import SessionManager

settings = load_settings()
sessions = SessionManager(settings)


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


class ChatRequest(BaseModel):
    message: str = Field(min_length=1)
    session_id: str | None = None


@app.get("/")
async def index():
    return FileResponse(frontend_dir / "index.html")


@app.get("/api/health")
async def health():
    return {
        "ok": True,
        "host_root": str(settings["host_root"]),
        "runtime": settings["runtime"],
        "model": settings["model"],
    }


@app.post("/api/chat")
async def chat(req: ChatRequest):
    result = await sessions.send(req.session_id, req.message.strip())
    if result.get("status") == "error" and "error" in result:
        raise HTTPException(status_code=502, detail=result["error"])
    return result


@app.post("/api/chat/stream")
async def chat_stream(req: ChatRequest):
    async def event_gen():
        async for event in sessions.stream(req.session_id, req.message.strip()):
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_gen(), media_type="text/event-stream")


frontend_dir = ROOT / "frontend"
frontend_dir.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=str(frontend_dir)), name="static")


def main():
    import uvicorn

    uvicorn.run(
        "backend.main:app",
        host=settings["host"],
        port=settings["port"],
        reload=settings["reload"],
        reload_dirs=[str(ROOT)],
    )


if __name__ == "__main__":
    main()
