"""Multi-conversation storage per user + provider."""

from __future__ import annotations

import json
import re
from typing import Any

from fastapi import HTTPException

from backend.db import db_session


def _row(row: Any) -> dict | None:
    return dict(row) if row else None


def list_conversations(user_id: int, provider: str) -> list[dict]:
    with db_session() as conn:
        rows = conn.execute(
            """
            SELECT id, user_id, provider, title, workspace_root, agent_session_id, model,
                   pinned, archived, updated_at, created_at
            FROM conversations
            WHERE user_id = ? AND provider = ? AND COALESCE(archived, 0) = 0
            ORDER BY COALESCE(pinned, 0) DESC, datetime(updated_at) DESC, id DESC
            """,
            (user_id, provider),
        ).fetchall()
        return [dict(r) for r in rows]


def get_conversation_by_id(user_id: int, conv_id: int) -> dict | None:
    with db_session() as conn:
        row = conn.execute(
            """
            SELECT * FROM conversations
            WHERE id = ? AND user_id = ?
            """,
            (conv_id, user_id),
        ).fetchone()
        return _row(row)


def create_conversation(
    user_id: int,
    provider: str,
    *,
    title: str = "新对话",
    workspace_root: str = "",
    payload_json: str = "{}",
    agent_session_id: str = "",
    model: str = "",
) -> dict:
    title = (title or "新对话").strip()[:80] or "新对话"
    with db_session() as conn:
        cur = conn.execute(
            """
            INSERT INTO conversations (
              user_id, provider, title, workspace_root, agent_session_id, model, payload_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id,
                provider,
                title,
                workspace_root or "",
                agent_session_id or "",
                model or "",
                payload_json or "{}",
            ),
        )
        conv_id = int(cur.lastrowid)
        row = conn.execute(
            "SELECT * FROM conversations WHERE id = ?",
            (conv_id,),
        ).fetchone()
        return dict(row)


def update_conversation(
    user_id: int,
    conv_id: int,
    *,
    payload_json: str | None = None,
    agent_session_id: str | None = None,
    model: str | None = None,
    title: str | None = None,
    workspace_root: str | None = None,
    pinned: bool | None = None,
    archived: bool | None = None,
) -> dict:
    row = get_conversation_by_id(user_id, conv_id)
    if row is None:
        raise HTTPException(status_code=404, detail="对话不存在")
    next_payload = payload_json if payload_json is not None else row["payload_json"]
    next_session = (
        agent_session_id if agent_session_id is not None else row["agent_session_id"]
    )
    next_model = model if model is not None else row["model"]
    next_title = row["title"]
    next_ws = row.get("workspace_root") or ""
    next_pinned = int(row.get("pinned") or 0)
    next_archived = int(row.get("archived") or 0)
    if title is not None:
        next_title = (title or "").strip()[:80] or next_title
    if workspace_root is not None:
        next_ws = (workspace_root or "").strip()
    if pinned is not None:
        next_pinned = 1 if pinned else 0
    if archived is not None:
        next_archived = 1 if archived else 0
    with db_session() as conn:
        conn.execute(
            """
            UPDATE conversations
            SET payload_json = ?,
                agent_session_id = ?,
                model = ?,
                title = ?,
                workspace_root = ?,
                pinned = ?,
                archived = ?,
                updated_at = datetime('now')
            WHERE id = ? AND user_id = ?
            """,
            (
                next_payload or "{}",
                next_session or "",
                next_model or "",
                next_title,
                next_ws,
                next_pinned,
                next_archived,
                conv_id,
                user_id,
            ),
        )
        updated = conn.execute(
            "SELECT * FROM conversations WHERE id = ?",
            (conv_id,),
        ).fetchone()
        return dict(updated)


def delete_conversation_by_id(user_id: int, conv_id: int) -> None:
    with db_session() as conn:
        cur = conn.execute(
            "DELETE FROM conversations WHERE id = ? AND user_id = ?",
            (conv_id, user_id),
        )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="对话不存在")


_TITLE_LEAD_RE = re.compile(
    r"^(请|麻烦你?|帮我|帮忙|请问|你好|您好|嗨|hey|hi|hello)"
    r"[，,、！!。.\s]*",
    re.I,
)
_TITLE_LEAD2_RE = re.compile(
    r"^(能否|可以|能不能|请帮我|帮我把|帮我写|帮我改|帮我看|我想|我要|我想要)"
    r"[，,、\s]*",
    re.I,
)
_TITLE_QUESTION_RE = re.compile(
    r"^(如何|怎么|怎样|怎么样|如何才能|怎么才能)(.+)$"
)
_TITLE_VERB_RE = re.compile(
    r"^(画一个|画个|写一个|写个|做一个|做个|实现|生成|创建|修改|调整|"
    r"查看|读取|展示|分析|解释|说明|重构)"
)
_TITLE_TRAIL_RE = re.compile(r"(一下|吗|呢|啊|呀|吧|嘛|哟)+$")


def is_placeholder_title(title: str | None) -> bool:
    """True when title is still auto-generated / not user-renamed."""
    t = (title or "").strip()
    if not t:
        return True
    if t in {"新对话", "Agent", "新 Agent", "Untitled", "untitled"}:
        return True
    if t.endswith(" Agent") or t.endswith(" agent"):
        return True
    # Legacy: first-message truncation used an ellipsis suffix.
    if t.endswith("…") or t.endswith("..."):
        return True
    return False


def summarize_chat_title(text: str, fallback: str = "新对话") -> str:
    """ChatGPT-style short topic title from the first user message (not a raw quote)."""
    raw = str(text or "")
    # Drop markdown noise and keep the first paragraph/sentence.
    raw = re.sub(r"```[\s\S]*?```", " ", raw)
    raw = re.sub(r"`[^`]+`", " ", raw)
    raw = re.sub(r"[*_#>]+", " ", raw)
    raw = re.sub(r"\s+", " ", raw).strip()
    if not raw:
        return fallback
    for sep in ("\n", "。", "？", "?", "！", "!", "；", ";"):
        if sep in raw:
            piece = raw.split(sep, 1)[0].strip()
            if piece:
                raw = piece
                break
    for _ in range(4):
        nxt = _TITLE_LEAD_RE.sub("", raw)
        nxt = _TITLE_LEAD2_RE.sub("", nxt).strip()
        if nxt == raw:
            break
        raw = nxt
    m = _TITLE_QUESTION_RE.match(raw)
    if m:
        raw = (m.group(2) or "").strip()
    raw = _TITLE_VERB_RE.sub("", raw).strip()
    raw = _TITLE_TRAIL_RE.sub("", raw).strip(" ，,、.-—")
    # Prefer a compact noun-phrase title (≈ ChatGPT sidebar length).
    if len(raw) > 22:
        raw = raw[:22].rstrip(" ，,、.-—")
    return raw or fallback


def title_from_payload(payload: dict | None, fallback: str = "新对话") -> str:
    if not isinstance(payload, dict):
        return fallback
    # Wait until the first agent reply exists — don't rename on user-send alone.
    if payload.get("streaming") or payload.get("pending"):
        return fallback
    messages = payload.get("messages") or []
    has_assistant = False
    first_user = ""
    for item in messages:
        if not isinstance(item, dict):
            continue
        kind = str(item.get("kind") or "")
        role = str(item.get("role") or "")
        is_user = kind == "user" or role in {"You", "user", "User"}
        is_agent = kind == "agent" or role in {"Agent", "assistant", "Assistant", "AI"}
        if is_user and not first_user:
            first_user = str(item.get("text") or "").strip()
        if is_agent:
            # Require some agent content (or worklog) so we know the turn finished.
            text = str(item.get("text") or "").strip()
            cards = item.get("worklog") or item.get("cards") or []
            if text or cards:
                has_assistant = True
    if not has_assistant or not first_user:
        return fallback
    return summarize_chat_title(first_user, fallback)


def should_auto_title(existing_title: str | None, payload: dict | None) -> bool:
    """True when placeholder title should become a short topic summary."""
    if not is_placeholder_title(existing_title):
        return False
    if not isinstance(payload, dict):
        return False
    if payload.get("streaming") or payload.get("pending"):
        return False
    titled = title_from_payload(payload, fallback="")
    return bool(titled and titled != "新对话")


def public_conversation(row: dict, *, include_payload: bool = False) -> dict:
    from pathlib import Path

    from backend.ssh_workspace import is_ssh_uri
    from backend.workspace import home_workspace, is_home_workspace, workspace_label

    ws = (row.get("workspace_root") or "").strip()
    if not ws:
        ws = str(home_workspace())
    is_ssh = is_ssh_uri(ws)
    try:
        name = workspace_label(ws if is_ssh else Path(ws))
    except OSError:
        name = "Home"
    payload = None
    try:
        payload = json.loads(row.get("payload_json") or "{}")
    except json.JSONDecodeError:
        payload = None
    streaming = bool(
        isinstance(payload, dict)
        and (payload.get("streaming") or payload.get("pending"))
    )
    messages = []
    if isinstance(payload, dict) and isinstance(payload.get("messages"), list):
        messages = payload.get("messages") or []
    is_empty = (not streaming) and len(messages) == 0
    out = {
        "id": int(row["id"]),
        "provider": row["provider"],
        "title": row.get("title") or "新对话",
        "workspace_root": ws,
        "workspace_name": name,
        "is_home": (not is_ssh) and is_home_workspace(ws),
        "is_ssh": is_ssh,
        "is_empty": is_empty,
        "session_id": row.get("agent_session_id") or "",
        "model": row.get("model") or "",
        "pinned": bool(row.get("pinned") or 0),
        "archived": bool(row.get("archived") or 0),
        "streaming": streaming,
        "updated_at": row.get("updated_at") or "",
        "created_at": row.get("created_at") or "",
    }
    if include_payload:
        out["payload"] = payload
    return out
