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

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.auth import (
    LEGACY_TOKEN_COOKIE,
    REMEMBER_DAYS,
    TOKEN_COOKIE,
    create_user,
    current_user,
    extract_token,
    issue_token,
    require_user,
    revoke_token,
    user_from_token,
    user_public,
    verify_login,
)
from backend.config import load_settings
from backend.conversations import (
    create_conversation,
    delete_conversation_by_id,
    get_conversation_by_id,
    list_conversations,
    public_conversation,
    is_placeholder_title,
    should_auto_title,
    title_from_payload,
    update_conversation,
)
from backend.db import init_db
from backend.model_catalog import get_model_options, resolve_model_selection
from backend.runtime import SessionManager

settings = load_settings()
init_db()
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

        threading.Thread(target=_run, name="coding-agent-runtime", daemon=True).start()
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
    return resolve_model_selection(model_id, settings.get("model", "auto"))


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    _ensure_worker_loop()
    await _worker_await(sessions.start())
    yield
    await _worker_await(sessions.stop())


app = FastAPI(title="Coding Agent", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,  # same-origin cookie auth; * + credentials is invalid CORS
    allow_methods=["*"],
    allow_headers=["*"],
)

_PUBLIC_EXACT = frozenset({"/login", "/favicon.ico", "/api/health", "/api/auth/login", "/api/auth/register"})
_PUBLIC_PREFIXES = ("/static/",)


def _is_public_path(path: str) -> bool:
    if path in _PUBLIC_EXACT:
        return True
    return any(path.startswith(p) for p in _PUBLIC_PREFIXES)


@app.middleware("http")
async def require_login_middleware(request: Request, call_next):
    path = request.url.path
    if request.method == "OPTIONS" or _is_public_path(path):
        return await call_next(request)
    user = current_user(request)
    if user is None:
        if path.startswith("/api/"):
            return JSONResponse({"detail": "未登录"}, status_code=401)
        next_url = path
        if request.url.query:
            next_url = f"{path}?{request.url.query}"
        return RedirectResponse(url=f"/login?next={next_url}", status_code=302)
    request.state.user = user
    return await call_next(request)


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
    # Absolute or relative project root for this agent turn.
    workspace: str | None = None
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


class ApproveRequest(BaseModel):
    session_id: str | None = None
    call_id: str | None = None
    approve: bool = False


class UndoRequest(BaseModel):
    session_id: str | None = None
    turn_id: str | None = None
    path: str | None = None  # set → undo one file; omit → undo all


class FollowRequest(BaseModel):
    session_id: str | None = None
    after: int = 0


class AuthLoginRequest(BaseModel):
    username: str
    password: str
    remember: bool = False


class AuthRegisterRequest(BaseModel):
    username: str
    password: str
    remember: bool = False


class HistoryPutRequest(BaseModel):
    payload: dict = Field(default_factory=dict)
    session_id: str | None = None
    model: str | None = None
    conversation_id: int | None = None
    title: str | None = None


class ConversationCreateRequest(BaseModel):
    provider: str = "cursor"
    title: str | None = None
    workspace_root: str | None = None


class ConversationPutRequest(BaseModel):
    payload: dict = Field(default_factory=dict)
    session_id: str | None = None
    model: str | None = None
    title: str | None = None
    workspace_root: str | None = None


class ConversationPatchRequest(BaseModel):
    title: str | None = None
    pinned: bool | None = None
    archived: bool | None = None
    workspace_root: str | None = None


class WorkspaceFilePut(BaseModel):
    root: str | None = None
    path: str
    content: str


class WorkspacePathRequest(BaseModel):
    root: str | None = None
    path: str
    content: str | None = None


class WorkspaceRenameRequest(BaseModel):
    root: str | None = None
    path: str
    new_name: str


class WorkspaceTransferRequest(BaseModel):
    root: str | None = None
    path: str
    dest: str


class WorkspaceExecRequest(BaseModel):
    root: str | None = None
    command: str
    cwd: str | None = None
    timeout: float | None = 30.0
    conda_env: str | None = None


class SshHostUpsert(BaseModel):
    id: str
    label: str | None = None
    host: str
    port: int = 22
    user: str
    auth: str = "key"
    key_path: str | None = None
    password: str | None = None
    default_path: str | None = "/"


def _normalize_ws(raw: str | None) -> str:
    from backend.workspace import normalize_workspace_key

    return normalize_workspace_key(raw, settings)


def _ssh_parts(ws_key: str) -> tuple[str, str]:
    from backend.ssh_workspace import parse_ssh_uri

    return parse_ssh_uri(ws_key)


class _WsCtx:
    """Resolved workspace for local Path APIs or SSH host_id + remote root."""

    __slots__ = ("key", "is_ssh", "host_id", "remote", "local")

    def __init__(
        self,
        *,
        key: str,
        is_ssh: bool,
        host_id: str | None = None,
        remote: str | None = None,
        local: Path | None = None,
    ) -> None:
        self.key = key
        self.is_ssh = is_ssh
        self.host_id = host_id
        self.remote = remote
        self.local = local


def _ws_ctx(root_raw: str | None) -> _WsCtx:
    from backend.ssh_workspace import effective_default_path, is_ssh_uri
    from backend.workspace import resolve_workspace_root

    ws_key = _normalize_ws(root_raw)
    if is_ssh_uri(ws_key):
        host_id, remote = _ssh_parts(ws_key)
        # Match mirror/picker: bare ssh://host/ means project/home, not FS root.
        if remote in {"/", "", "."}:
            remote = effective_default_path(host_id)
        return _WsCtx(key=ws_key, is_ssh=True, host_id=host_id, remote=remote)
    return _WsCtx(
        key=ws_key,
        is_ssh=False,
        local=resolve_workspace_root(ws_key, settings),
    )


def _ssh_unsupported(detail: str) -> None:
    raise HTTPException(status_code=400, detail=detail)


frontend_dir = ROOT / "frontend"
frontend_dir.mkdir(exist_ok=True)

# Source parts under frontend/js/; /static/widget.js stays the embed URL.
_JS_PARTS = (
    "shell.js",
    "chrome.js",
    "markdown.js",
    "thread.js",
    "history.js",
    "ide.js",
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
        selected = str(settings.get("model", "auto"))
    cache_json = json.dumps(options, ensure_ascii=False).replace("<", "\\u003c")
    page = (frontend_dir / name).read_text(encoding="utf-8")
    page = page.replace("__CODING_AGENT_MODEL_CACHE__", cache_json)
    page = page.replace("__CODING_AGENT_DEFAULT_MODEL__", html.escape(selected, quote=True))
    page = page.replace("__CODING_AGENT_PROVIDER__", html.escape(provider, quote=True))
    return Response(page, media_type="text/html; charset=utf-8")


def _set_auth_cookie(response: Response, token: str, *, remember: bool) -> None:
    # remember → REMEMBER_DAYS; otherwise browser-session cookie (no max_age).
    kwargs = {
        "key": TOKEN_COOKIE,
        "value": token,
        "httponly": True,
        "samesite": "lax",
        "path": "/",
    }
    if remember:
        kwargs["max_age"] = int(REMEMBER_DAYS) * 24 * 3600
    response.set_cookie(**kwargs)
    # Drop pre-rename cookie so old sessions don't linger.
    response.delete_cookie(key=LEGACY_TOKEN_COOKIE, path="/")


def _clear_auth_cookie(response: Response) -> None:
    response.delete_cookie(key=TOKEN_COOKIE, path="/")
    response.delete_cookie(key=LEGACY_TOKEN_COOKIE, path="/")


@app.get("/login")
async def login_page(request: Request):
    if current_user(request) is not None:
        return RedirectResponse(url="/", status_code=302)
    page = (frontend_dir / "login.html").read_text(encoding="utf-8")
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


@app.post("/api/auth/register")
async def auth_register(req: AuthRegisterRequest):
    user = create_user(req.username, req.password, is_admin=False)
    token, _expires = issue_token(int(user["id"]), remember=req.remember)
    body = {"ok": True, "token": token, "user": user_public(user), "remember": req.remember}
    response = JSONResponse(body)
    _set_auth_cookie(response, token, remember=req.remember)
    return response


@app.post("/api/auth/login")
async def auth_login(req: AuthLoginRequest):
    user = verify_login(req.username, req.password)
    token, _expires = issue_token(int(user["id"]), remember=req.remember)
    body = {"ok": True, "token": token, "user": user_public(user), "remember": req.remember}
    response = JSONResponse(body)
    _set_auth_cookie(response, token, remember=req.remember)
    return response


@app.post("/api/auth/logout")
async def auth_logout(request: Request):
    revoke_token(extract_token(request))
    response = JSONResponse({"ok": True})
    _clear_auth_cookie(response)
    return response


@app.get("/api/auth/me")
async def auth_me(request: Request):
    user = require_user(request)
    return {"ok": True, "user": user_public(user)}


@app.get("/api/conversations")
async def conversations_list(request: Request, provider: str = "cursor"):
    from backend.providers import normalize_provider

    user = require_user(request)
    prov = normalize_provider(provider)
    rows = list_conversations(int(user["id"]), prov)
    return {
        "ok": True,
        "conversations": [public_conversation(r) for r in rows],
    }


@app.post("/api/conversations")
async def conversations_create(req: ConversationCreateRequest, request: Request):
    from backend.providers import normalize_provider

    user = require_user(request)
    prov = normalize_provider(req.provider)
    ws = _normalize_ws(req.workspace_root)
    title = (req.title or "").strip() or "新对话"
    row = create_conversation(
        int(user["id"]),
        prov,
        title=title,
        workspace_root=ws,
    )
    return {"ok": True, "conversation": public_conversation(row, include_payload=True)}


@app.get("/api/conversations/{conv_id}")
async def conversations_get(conv_id: int, request: Request):
    user = require_user(request)
    row = get_conversation_by_id(int(user["id"]), int(conv_id))
    if row is None:
        raise HTTPException(status_code=404, detail="对话不存在")
    return {"ok": True, "conversation": public_conversation(row, include_payload=True)}


@app.put("/api/conversations/{conv_id}")
async def conversations_put(conv_id: int, req: ConversationPutRequest, request: Request):
    user = require_user(request)
    uid = int(user["id"])
    existing = get_conversation_by_id(uid, int(conv_id))
    if existing is None:
        raise HTTPException(status_code=404, detail="对话不存在")
    payload = dict(req.payload or {})
    # Background poll may only clear streaming without rewriting messages.
    if payload.pop("_clearStreamingOnly", None):
        try:
            existing_payload = json.loads(existing.get("payload_json") or "{}")
        except (TypeError, json.JSONDecodeError):
            existing_payload = {}
        if not isinstance(existing_payload, dict):
            existing_payload = {}
        existing_payload["streaming"] = False
        existing_payload["pending"] = False
        if req.session_id:
            existing_payload["sessionId"] = str(req.session_id).strip()
        payload = existing_payload
    session_id = (req.session_id or payload.get("sessionId") or "").strip()
    model = (req.model or payload.get("model") or "").strip()
    title = req.title
    if title is None and should_auto_title(existing.get("title"), payload):
        # Auto topic title once first reply finishes; never overwrite user rename.
        # ChatGPT-style: Composer title (heuristic fallback inside).
        title = await asyncio.to_thread(
            title_from_payload,
            payload,
            str(existing.get("title") or "新对话"),
            settings=settings,
            provider=existing.get("provider"),
        )
    elif title is None:
        title = None
    # PUT persists messages/session only. Workspace affiliation is set at create
    # (or via explicit PATCH). Ignoring req.workspace_root prevents accidental moves.
    row = update_conversation(
        uid,
        int(conv_id),
        payload_json=json.dumps(payload, ensure_ascii=False),
        agent_session_id=session_id if session_id else None,
        model=model if model else None,
        title=title,
        workspace_root=None,
    )
    return {"ok": True, "conversation": public_conversation(row)}


@app.patch("/api/conversations/{conv_id}")
async def conversations_patch(conv_id: int, req: ConversationPatchRequest, request: Request):
    user = require_user(request)
    if (
        req.title is None
        and req.pinned is None
        and req.archived is None
        and req.workspace_root is None
    ):
        raise HTTPException(status_code=400, detail="没有可更新的字段")
    ws = None
    if req.workspace_root is not None:
        ws = _normalize_ws(req.workspace_root)
    row = update_conversation(
        int(user["id"]),
        int(conv_id),
        title=req.title,
        pinned=req.pinned,
        archived=req.archived,
        workspace_root=ws,
    )
    return {"ok": True, "conversation": public_conversation(row)}


@app.delete("/api/conversations/{conv_id}")
async def conversations_delete(conv_id: int, request: Request):
    user = require_user(request)
    delete_conversation_by_id(int(user["id"]), int(conv_id))
    return {"ok": True}


@app.get("/api/history/{provider}")
async def history_get(provider: str, request: Request, conversation_id: int | None = None):
    """Compat: latest conversation for provider, or a specific id."""
    from backend.providers import normalize_provider

    user = require_user(request)
    uid = int(user["id"])
    if conversation_id is not None:
        row = get_conversation_by_id(uid, int(conversation_id))
    else:
        rows = list_conversations(uid, normalize_provider(provider))
        row = rows[0] if rows else None
    if row is None:
        return {"ok": True, "payload": None, "conversation_id": None}
    pub = public_conversation(row, include_payload=True)
    return {
        "ok": True,
        "conversation_id": pub["id"],
        "payload": pub.get("payload"),
        "session_id": pub.get("session_id") or "",
        "model": pub.get("model") or "",
        "title": pub.get("title") or "",
        "updated_at": pub.get("updated_at") or "",
    }


@app.put("/api/history/{provider}")
async def history_put(provider: str, req: HistoryPutRequest, request: Request):
    """Compat upsert: update conversation_id, or create when missing."""
    from backend.providers import normalize_provider

    user = require_user(request)
    uid = int(user["id"])
    prov = normalize_provider(provider)
    payload = dict(req.payload or {})
    session_id = (req.session_id or payload.get("sessionId") or "").strip()
    model = (req.model or payload.get("model") or "").strip()
    conv_id = req.conversation_id
    if conv_id is None:
        title = (req.title or "").strip() or await asyncio.to_thread(
            title_from_payload,
            payload,
            "新对话",
            settings=settings,
            provider=prov,
            use_llm=False,  # create often has no assistant yet; heuristic only
        )
        row = create_conversation(
            uid,
            prov,
            title=title,
            payload_json=json.dumps(payload, ensure_ascii=False),
            agent_session_id=session_id,
            model=model,
        )
    else:
        existing = get_conversation_by_id(uid, int(conv_id))
        if req.title is not None:
            title = req.title
        elif existing and should_auto_title(existing.get("title"), payload):
            title = await asyncio.to_thread(
                title_from_payload,
                payload,
                str(existing.get("title") or "新对话"),
                settings=settings,
                provider=prov,
            )
        else:
            title = None
        row = update_conversation(
            uid,
            int(conv_id),
            payload_json=json.dumps(payload, ensure_ascii=False),
            agent_session_id=session_id,
            model=model,
            title=title,
        )
    pub = public_conversation(row)
    return {"ok": True, "conversation_id": pub["id"], "conversation": pub}


@app.delete("/api/history/{provider}")
async def history_delete(
    provider: str, request: Request, conversation_id: int | None = None
):
    from backend.providers import normalize_provider

    user = require_user(request)
    uid = int(user["id"])
    if conversation_id is not None:
        delete_conversation_by_id(uid, int(conversation_id))
        return {"ok": True}
    # No id → clear all for provider (legacy "new chat wipe")
    for row in list_conversations(uid, normalize_provider(provider)):
        delete_conversation_by_id(uid, int(row["id"]))
    return {"ok": True}


@app.get("/api/workspace/roots")
async def workspace_roots(request: Request):
    from backend.workspace import home_workspace, recent_workspace_suggestions

    user = require_user(request)
    rows = list_conversations(int(user["id"]), "cursor")
    # Also pull OpenAI/DeepSeek so SSH recents appear regardless of page.
    for prov in ("openai", "deepseek"):
        rows.extend(list_conversations(int(user["id"]), prov))
    roots = [str(r.get("workspace_root") or "") for r in rows]
    home = str(home_workspace())
    return {
        "ok": True,
        "home": home,
        "default": home,
        "project_root": str(settings["host_root"]),
        "roots": recent_workspace_suggestions(settings, roots),
    }


@app.get("/api/workspace/local")
async def workspace_local_list(request: Request, q: str = ""):
    """On This PC folder suggestions."""
    from backend.workspace import local_folder_suggestions

    require_user(request)
    return {"ok": True, "roots": local_folder_suggestions(settings, q)}


@app.get("/api/workspace/tree")
async def workspace_tree(
    request: Request,
    root: str = "",
    path: str = ".",
    depth: int = 2,
):
    from backend.ssh_workspace import list_tree as ssh_list_tree
    from backend.workspace import list_tree

    require_user(request)
    ctx = _ws_ctx(root or None)
    depth_n = max(1, min(depth, 4))
    if ctx.is_ssh:
        return {"ok": True, **ssh_list_tree(ctx.host_id, ctx.remote, path, depth=depth_n)}
    return {"ok": True, **list_tree(ctx.local, path, depth=depth_n)}


@app.get("/api/workspace/file")
async def workspace_file_get(request: Request, root: str = "", path: str = ""):
    from backend.ssh_workspace import read_file as ssh_read_file
    from backend.workspace import read_file

    require_user(request)
    if not (path or "").strip():
        raise HTTPException(status_code=422, detail="path required")
    ctx = _ws_ctx(root or None)
    if ctx.is_ssh:
        return {"ok": True, **ssh_read_file(ctx.host_id, ctx.remote, path)}
    return {"ok": True, **read_file(ctx.local, path)}


@app.put("/api/workspace/file")
async def workspace_file_put(req: WorkspaceFilePut, request: Request):
    from backend.ssh_workspace import write_file as ssh_write_file
    from backend.workspace import write_file

    require_user(request)
    ctx = _ws_ctx(req.root)
    if ctx.is_ssh:
        return ssh_write_file(ctx.host_id, ctx.remote, req.path, req.content)
    return write_file(ctx.local, req.path, req.content)


@app.post("/api/workspace/create")
async def workspace_create(req: WorkspacePathRequest, request: Request):
    from backend.ssh_workspace import create_file as ssh_create_file
    from backend.workspace import create_file

    require_user(request)
    ctx = _ws_ctx(req.root)
    if ctx.is_ssh:
        return ssh_create_file(ctx.host_id, ctx.remote, req.path, req.content or "")
    return create_file(ctx.local, req.path, req.content or "")


@app.post("/api/workspace/mkdir")
async def workspace_mkdir(req: WorkspacePathRequest, request: Request):
    from backend.ssh_workspace import create_dir as ssh_create_dir
    from backend.workspace import create_dir

    require_user(request)
    ctx = _ws_ctx(req.root)
    if ctx.is_ssh:
        return ssh_create_dir(ctx.host_id, ctx.remote, req.path)
    return create_dir(ctx.local, req.path)


@app.post("/api/workspace/rename")
async def workspace_rename(req: WorkspaceRenameRequest, request: Request):
    from backend.ssh_workspace import rename_entry as ssh_rename
    from backend.workspace import rename_entry

    require_user(request)
    ctx = _ws_ctx(req.root)
    if ctx.is_ssh:
        return ssh_rename(ctx.host_id, ctx.remote, req.path, req.new_name)
    return rename_entry(ctx.local, req.path, req.new_name)


@app.post("/api/workspace/delete")
async def workspace_delete(req: WorkspacePathRequest, request: Request):
    from backend.ssh_workspace import delete_entry as ssh_delete
    from backend.workspace import delete_entry

    require_user(request)
    ctx = _ws_ctx(req.root)
    if ctx.is_ssh:
        return ssh_delete(ctx.host_id, ctx.remote, req.path)
    return delete_entry(ctx.local, req.path)


@app.post("/api/workspace/copy")
async def workspace_copy(req: WorkspaceTransferRequest, request: Request):
    from backend.workspace import copy_entry

    require_user(request)
    ctx = _ws_ctx(req.root)
    if ctx.is_ssh:
        _ssh_unsupported("SSH 工作区暂不支持复制，请用远程 shell")
    return copy_entry(ctx.local, req.path, req.dest)


@app.post("/api/workspace/move")
async def workspace_move(req: WorkspaceTransferRequest, request: Request):
    from backend.workspace import move_entry

    require_user(request)
    ctx = _ws_ctx(req.root)
    if ctx.is_ssh:
        _ssh_unsupported("SSH 工作区暂不支持移动，请用远程 shell")
    return move_entry(ctx.local, req.path, req.dest)


@app.get("/api/workspace/info")
async def workspace_info(request: Request, root: str = "", path: str = "."):
    from backend.ssh_workspace import path_info as ssh_path_info
    from backend.workspace import path_info

    require_user(request)
    ctx = _ws_ctx(root or None)
    if ctx.is_ssh:
        return ssh_path_info(ctx.host_id, ctx.remote, path or ".")
    return path_info(ctx.local, path or ".")


@app.get("/api/workspace/git")
async def workspace_git(request: Request, root: str = ""):
    from backend.ssh_workspace import git_info_remote
    from backend.workspace import git_info

    require_user(request)
    ctx = _ws_ctx(root or None)
    if ctx.is_ssh:
        return git_info_remote(ctx.host_id, ctx.remote)
    return git_info(ctx.local)


@app.post("/api/workspace/reveal")
async def workspace_reveal(req: WorkspacePathRequest, request: Request):
    from backend.workspace import reveal_in_os

    require_user(request)
    ctx = _ws_ctx(req.root)
    if ctx.is_ssh:
        _ssh_unsupported("SSH 远程路径无法在本机资源管理器打开")
    return reveal_in_os(ctx.local, req.path)


@app.post("/api/workspace/exec")
async def workspace_exec(req: WorkspaceExecRequest, request: Request):
    from backend.ssh_workspace import run_command as ssh_run
    from backend.workspace import run_command

    require_user(request)
    ctx = _ws_ctx(req.root)
    timeout = float(req.timeout or 30)
    if ctx.is_ssh:
        return ssh_run(
            ctx.host_id,
            ctx.remote,
            req.command,
            cwd=req.cwd,
            timeout=timeout,
        )
    return run_command(
        ctx.local,
        req.command,
        cwd=req.cwd,
        timeout=timeout,
        conda_env=req.conda_env,
    )


@app.websocket("/api/workspace/term/ws")
async def workspace_term_ws(websocket: WebSocket):
    """Realtime PTY: binary frames = stdin/stdout; text JSON = resize/ready/exit/error."""
    from backend.term_pty import drop_session, open_local_session, open_ssh_session

    # Auth: cookie (upgrade) or ?token= (Bearer embeds)
    token = (websocket.query_params.get("token") or "").strip()
    cookie = (websocket.cookies.get(TOKEN_COOKIE) or "").strip()
    user = user_from_token(token or cookie or None)
    if user is None:
        await websocket.close(code=4401)
        return

    await websocket.accept()
    uid = int(user["id"])
    root_raw = (websocket.query_params.get("root") or "").strip()
    cwd = (websocket.query_params.get("cwd") or "").strip() or None
    shell_id = (websocket.query_params.get("shell_id") or "").strip() or None
    try:
        cols = int(websocket.query_params.get("cols") or 80)
        rows = int(websocket.query_params.get("rows") or 24)
    except ValueError:
        cols, rows = 80, 24

    sess = None
    try:
        ctx = _ws_ctx(root_raw or None)
        if ctx.is_ssh:
            sess = open_ssh_session(
                user_id=uid,
                host_id=ctx.host_id,
                remote_cwd=cwd or ctx.remote,
                cols=cols,
                rows=rows,
                shell_id=shell_id,
            )
        else:
            sess = open_local_session(
                user_id=uid,
                root=ctx.local,
                cwd=cwd,
                cols=cols,
                rows=rows,
                shell_id=shell_id,
            )
        await websocket.send_text(
            json.dumps({"type": "ready", "shell_id": sess.shell_id}, ensure_ascii=False)
        )
    except HTTPException as err:
        detail = err.detail if isinstance(err.detail, str) else "无法启动终端"
        await websocket.send_text(
            json.dumps({"type": "error", "message": detail}, ensure_ascii=False)
        )
        await websocket.close(code=4400)
        return
    except Exception as err:  # noqa: BLE001
        await websocket.send_text(
            json.dumps({"type": "error", "message": str(err)}, ensure_ascii=False)
        )
        await websocket.close(code=1011)
        return

    async def _pump_out() -> None:
        assert sess is not None
        while True:
            kind, payload = await asyncio.to_thread(sess.out_q.get)
            if kind == "data":
                await websocket.send_bytes(payload if isinstance(payload, (bytes, bytearray)) else bytes(payload))
            elif kind == "exit":
                await websocket.send_text(
                    json.dumps({"type": "exit", "code": int(payload or 0)}, ensure_ascii=False)
                )
                break
            else:
                break

    pump = asyncio.create_task(_pump_out())
    try:
        while True:
            message = await websocket.receive()
            if message.get("type") == "websocket.disconnect":
                break
            data = message.get("bytes")
            if data is not None:
                sess.write(bytes(data))
                continue
            text = message.get("text")
            if text is None:
                continue
            try:
                msg = json.loads(text)
            except json.JSONDecodeError:
                # Treat plain text as stdin (UTF-8)
                sess.write(text.encode("utf-8", errors="replace"))
                continue
            if not isinstance(msg, dict):
                continue
            mtype = str(msg.get("type") or "")
            if mtype == "resize":
                try:
                    c = int(msg.get("cols") or cols)
                    r = int(msg.get("rows") or rows)
                except (TypeError, ValueError):
                    continue
                sess.resize(c, r)
            elif mtype == "stdin":
                raw = msg.get("data")
                if isinstance(raw, str):
                    sess.write(raw.encode("utf-8", errors="replace"))
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        pump.cancel()
        try:
            await pump
        except Exception:
            pass
        if sess is not None:
            drop_session(uid, sess.shell_id)


@app.get("/api/ssh/hosts")
async def ssh_hosts_list(request: Request):
    from backend.ssh_hosts import list_hosts_merged, _ssh_config_path

    require_user(request)
    cfg = _ssh_config_path()
    return {
        "ok": True,
        "hosts": list_hosts_merged(include_secrets=False),
        "ssh_config": str(cfg),
        "ssh_config_exists": cfg.is_file(),
    }


@app.post("/api/ssh/hosts")
async def ssh_hosts_upsert(req: SshHostUpsert, request: Request):
    from backend.ssh_hosts import upsert_host

    require_user(request)
    host = upsert_host(req.model_dump())
    return {"ok": True, "host": host}


@app.delete("/api/ssh/hosts/{host_id}")
async def ssh_hosts_delete(host_id: str, request: Request):
    from backend.ssh_hosts import delete_host
    from backend.ssh_workspace import drop_client

    require_user(request)
    delete_host(host_id)
    drop_client(host_id)
    return {"ok": True}


@app.post("/api/ssh/hosts/{host_id}/test")
async def ssh_hosts_test(host_id: str, request: Request):
    from backend.ssh_workspace import test_connection

    require_user(request)
    return await asyncio.to_thread(test_connection, host_id)


@app.post("/api/ssh/hosts/{host_id}/warm")
async def ssh_hosts_warm(host_id: str, request: Request):
    """Warm/reuse SSH pool when opening the remote tree (non-destructive)."""
    from backend.ssh_workspace import warm_connection

    require_user(request)
    return await asyncio.to_thread(warm_connection, host_id)


@app.get("/api/ssh/hosts/{host_id}/os")
async def ssh_hosts_os(host_id: str, request: Request, refresh: bool = False):
    """Detect remote OS/shell (Windows→cmd, Linux/macOS→bash/sh)."""
    from backend.ssh_workspace import detect_remote_os

    require_user(request)
    info = await asyncio.to_thread(detect_remote_os, host_id, force=bool(refresh))
    return {"ok": True, "id": host_id, "os": info, **info}


@app.get("/api/ssh/hosts/{host_id}/tree")
async def ssh_hosts_tree(
    host_id: str,
    request: Request,
    path: str = "",
):
    from backend.ssh_hosts import get_host
    from backend import ssh_workspace as ssh_ws

    require_user(request)
    host = get_host(host_id, include_secrets=False)
    raw = (path or "").strip()
    # Empty / ~ → login home on first open. Explicit "/" must stay "/" (parent of /home).
    if not raw or raw in {"~", "~/"}:
        resolve = getattr(ssh_ws, "effective_default_path", None)
        if resolve is None:
            remote = str(host.get("default_path") or "/").strip() or "/"
        else:
            remote = await asyncio.to_thread(resolve, host_id, host)
    elif raw == "/":
        remote = "/"
    else:
        remote = raw if raw.startswith("/") or (len(raw) >= 2 and raw[1] == ":") else "/" + raw
    data = ssh_ws.list_tree(host_id, remote, ".", depth=1)
    # For picker: list direct children of `path` as absolute remote dirs.
    entries = []
    for e in data.get("entries") or []:
        if e.get("type") != "dir":
            continue
        child = remote.rstrip("/") + "/" + e["name"] if remote not in {"/", ""} else "/" + e["name"]
        entries.append({
            "name": e["name"],
            "path": child,
            "uri": ssh_ws.format_ssh_uri(host_id, child),
            "type": "dir",
        })
    return {
        "ok": True,
        "host_id": host_id,
        "label": host.get("label") or host_id,
        "path": remote,
        "uri": ssh_ws.format_ssh_uri(host_id, remote),
        "entries": entries,
    }


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


@app.get("/api/mcp/status")
async def api_mcp_status(request: Request, refresh: bool = False):
    """List configured MCP servers + tool/resource/prompt counts (compat agents)."""
    from backend.mcp_client import get_mcp_manager

    require_user(request)
    mgr = get_mcp_manager(settings, refresh=bool(refresh))
    servers = await asyncio.to_thread(mgr.status)
    return {"servers": servers, "enabled": bool((settings.get("mcp") or {}).get("enabled", True))}


@app.post("/api/mcp/refresh")
async def api_mcp_refresh(request: Request):
    """Restart MCP pool (pick up .cursor/mcp.json / config changes)."""
    from backend.mcp_client import get_mcp_manager

    require_user(request)
    mgr = get_mcp_manager(settings, refresh=True)
    servers = await asyncio.to_thread(mgr.status)
    return {"ok": True, "servers": servers}


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
            workspace=req.workspace,
        )
    )
    if result.get("status") == "error" and "error" in result:
        raise HTTPException(status_code=502, detail=result["error"])
    return result


@app.post("/api/chat/cancel")
async def cancel_chat(req: CancelRequest):
    await _worker_await(sessions.cancel(req.session_id))
    return {"ok": True}


@app.post("/api/chat/approve")
async def approve_chat(req: ApproveRequest):
    """Allow/deny a pending dangerous shell command during a compat agent turn."""
    if not req.session_id or not req.call_id:
        raise HTTPException(status_code=422, detail="session_id and call_id are required")
    result = await _worker_await(
        sessions.approve_tool(req.session_id, req.call_id, approve=bool(req.approve))
    )
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("error") or "approve failed")
    return result


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
                workspace=req.workspace,
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
    # Pass the app object (not "backend.main:app") so Windows does not spawn a
    # second worker under the venv base interpreter (Anaconda python.exe). That
    # split caused pid-file ≠ listener and intermittent "Bridge request failed
    # with HTTP 502" from orphan / mismatched cursor-sdk-bridge processes.
    run_kwargs = {
        "app": app,
        "host": host,
        "port": port,
        "reload": False,
    }
    if settings["reload"]:
        # reload requires an import string; keep it opt-in and document the risk.
        run_kwargs["app"] = "backend.main:app"
        run_kwargs["reload"] = True
        run_kwargs["reload_dirs"] = [str(ROOT / "backend"), str(ROOT / "frontend")]
    uvicorn.run(**run_kwargs)


if __name__ == "__main__":
    main()
