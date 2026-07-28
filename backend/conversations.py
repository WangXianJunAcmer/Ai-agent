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
                   pinned, archived, updated_at, created_at, payload_json
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
    r"^(请|麻烦你?|帮我|帮忙|请问|"
    r"你好[呀啊呢吧嘛哟]?|您好[呀啊呢吧嘛哟]?|嗨|hey|hi|hello)"
    r"[，,、！!。.\s]*",
    re.I,
)
_TITLE_LEAD2_RE = re.compile(
    r"^(能否|可以|能不能|请帮我|帮我把|帮我写|帮我改|帮我看|我想要|我想|我要)"
    r"[，,、\s]*",
    re.I,
)
_TITLE_ORPHAN_PARTICLE_RE = re.compile(r"^[呀啊呢吧嘛哟]+[，,、！!。.\s]*")
_TITLE_TRAIL_RE = re.compile(r"(一下|吗|呢|啊|呀|吧|嘛|哟|啦)+$")

# ChatGPT-style: Composer one-shot titles (not regex quotes of the first message).
_TITLE_SYSTEM = """You generate short sidebar titles for a coding chat app (like ChatGPT).
Output ONLY the title text. No quotes, no trailing punctuation, no explanation, no emoji.
Do not call tools. Do not read or edit files. Do not explore the workspace.

Rules:
- Same language as the user message (Chinese in → Chinese title)
- Chinese: about 4–14 characters. English: 3–7 words, sentence case
- Capture the user's goal so they can find this chat later
- Be specific (feature, file, bug, tool name). Avoid vague titles like "帮忙一下" / "Code changes"
- Strip greetings and filler. Never answer the question — only title it

Examples:
用户: 你好呀，我想看看当前项目目录都有啥
标题: 查看项目目录

用户: 我机器上有个easyconnect的vpn，你能找到他吗？
标题: 查找 EasyConnect

用户: 帮我修一下登录页按钮点不动
标题: 修复登录按钮

用户: Who was Genghis Khan? How long did he rule?
标题: Genghis Khan
"""


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


def _clean_title_output(raw: str, fallback: str) -> str:
    text = (raw or "").strip()
    if not text:
        return fallback
    # Drop accidental JSON / quotes / markdown fences.
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text).strip()
    if text.startswith("{") and "title" in text:
        try:
            data = json.loads(text)
            if isinstance(data, dict) and data.get("title"):
                text = str(data["title"]).strip()
        except json.JSONDecodeError:
            m = re.search(r'"title"\s*:\s*"([^"]+)"', text)
            if m:
                text = m.group(1).strip()
    text = text.strip().strip("\"'`“”‘’").strip()
    text = re.sub(r"[\s]+", " ", text)
    text = text.rstrip(" 。．.!?！？;；")
    # Reject refusals / meta.
    low = text.lower()
    if any(x in low for x in ("cannot", "can't", "as an ai", "i'm sorry", "无法", "不能生成")):
        return fallback
    if len(text) > 40:
        text = text[:40].rstrip(" ，,、.-—")
    return text or fallback


def summarize_chat_title(text: str, fallback: str = "新对话") -> str:
    """Heuristic fallback when LLM title is unavailable (offline / no key / timeout)."""
    source = str(text or "")
    raw = re.sub(r"```[\s\S]*?```", " ", source)
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
        nxt = _TITLE_ORPHAN_PARTICLE_RE.sub("", nxt)
        nxt = _TITLE_LEAD2_RE.sub("", nxt).strip()
        if nxt == raw:
            break
        raw = nxt
    # Soft intent normalize (fallback only).
    raw = re.sub(r"^(看看|看一下|看下|瞅瞅)", "查看", raw)
    raw = re.sub(r"^(找一下|找下|找找|帮我找)", "查找", raw)
    raw = re.sub(r"^(修一下|修下|修修|帮我修)", "修复", raw)
    raw = _TITLE_TRAIL_RE.sub("", raw).strip(" ，,、.-—")
    # "有个X…找到" → keep product-ish token
    m = re.search(
        r"(?:有个|有一个)?\s*([A-Za-z][A-Za-z0-9._-]{1,32}|[\u4e00-\u9fff]{2,12})"
        r".{0,12}(?:vpn|VPN|找到|找一下|在哪)",
        source,
        re.I,
    )
    if m and (not raw or len(raw) > 18):
        token = m.group(1)
        raw = f"查找 {token}" if re.match(r"^[A-Za-z]", token) else f"查找{token}"
    if not raw:
        raw = re.sub(r"\s+", " ", source).strip()
        raw = _TITLE_TRAIL_RE.sub("", raw).strip(" ，,、.-—") or source.strip()
    if len(raw) > 22:
        raw = raw[:22].rstrip(" ，,、.-—")
    return raw or fallback


def llm_generate_title(
    user_text: str,
    *,
    assistant_text: str = "",
    settings: dict | None = None,
    provider: str | None = None,  # unused; titles always use Composer
) -> str | None:
    """Composer one-shot → sidebar title. None on skip/failure (caller uses heuristic)."""
    del provider  # titles are always Composer, not the chat's OpenAI/DeepSeek model
    text = (user_text or "").strip()
    if not text:
        return None

    cfg = settings
    if cfg is None:
        try:
            from backend.config import load_settings

            cfg = load_settings()
        except Exception:
            return None

    from backend.config import cursor_api_key

    key = cursor_api_key(cfg)
    if not key:
        return None

    user_blob = text[:800]
    asst = (assistant_text or "").strip()[:400]
    content = f"{_TITLE_SYSTEM}\n\n用户消息:\n{user_blob}"
    if asst:
        content += f"\n\n助手开头:\n{asst}"
    content += (
        "\n\nReply with ONLY the title text. Do not call tools, "
        "read files, or explore the workspace.\n标题:"
    )

    # ponytail: no raw Composer chat API — Agent.prompt is the official path.
    # Empty cwd so a misbehaving run cannot touch the real project.
    try:
        from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout
        from pathlib import Path

        from cursor_sdk import Agent, AgentOptions, LocalAgentOptions

        cwd = Path(str(cfg.get("host_root") or ".")).resolve() / "data" / "title_agent"
        cwd.mkdir(parents=True, exist_ok=True)

        def _run() -> str:
            result = Agent.prompt(
                content,
                AgentOptions(
                    api_key=key,
                    model={
                        "id": "composer-2.5",
                        "params": [{"id": "fast", "value": "true"}],
                    },
                    local=LocalAgentOptions(cwd=str(cwd)),
                ),
            )
            return str(getattr(result, "result", "") or "")

        with ThreadPoolExecutor(max_workers=1) as pool:
            try:
                raw = pool.submit(_run).result(timeout=25)
            except FuturesTimeout:
                return None
        title = _clean_title_output(raw, "")
        return title or None
    except Exception:
        return None


def _payload_user_texts(payload: dict) -> list[str]:
    out: list[str] = []
    for item in payload.get("messages") or []:
        if not isinstance(item, dict):
            continue
        kind = str(item.get("kind") or "")
        role = str(item.get("role") or "")
        if kind == "user" or role in {"You", "user", "User"}:
            text = str(item.get("text") or "").strip()
            if text:
                out.append(text)
    return out


def _payload_first_assistant_text(payload: dict) -> str:
    for item in payload.get("messages") or []:
        if not isinstance(item, dict):
            continue
        kind = str(item.get("kind") or "")
        role = str(item.get("role") or "")
        if kind == "agent" or role in {"Agent", "assistant", "Assistant", "AI"}:
            text = str(item.get("text") or "").strip()
            if text:
                return text
    return ""


def _payload_has_assistant(payload: dict) -> bool:
    for item in payload.get("messages") or []:
        if not isinstance(item, dict):
            continue
        kind = str(item.get("kind") or "")
        role = str(item.get("role") or "")
        if kind == "agent" or role in {"Agent", "assistant", "Assistant", "AI"}:
            text = str(item.get("text") or "").strip()
            cards = item.get("worklog") or item.get("cards") or []
            if text or cards:
                return True
    return False


def title_from_payload(
    payload: dict | None,
    fallback: str = "新对话",
    *,
    settings: dict | None = None,
    provider: str | None = None,
    use_llm: bool = True,
) -> str:
    if not isinstance(payload, dict):
        return fallback
    # Wait until the first agent reply exists — don't rename on user-send alone.
    if payload.get("streaming") or payload.get("pending"):
        return fallback
    user_texts = _payload_user_texts(payload)
    if not _payload_has_assistant(payload) or not user_texts:
        return fallback
    user0 = user_texts[0]
    if use_llm:
        llm = llm_generate_title(
            user0,
            assistant_text=_payload_first_assistant_text(payload),
            settings=settings,
            provider=provider,
        )
        if llm:
            return llm
    return summarize_chat_title(user0, fallback)


def should_auto_title(existing_title: str | None, payload: dict | None) -> bool:
    """True once: placeholder + first user turn finished. Never again after that."""
    if not is_placeholder_title(existing_title):
        return False
    if not isinstance(payload, dict):
        return False
    if payload.get("streaming") or payload.get("pending"):
        return False
    # Exactly one user message = still the first round.
    if len(_payload_user_texts(payload)) != 1:
        return False
    return _payload_has_assistant(payload)


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
    raw_payload = row.get("payload_json")
    # List queries must include payload_json; missing key must NOT mean empty
    # (otherwise every nav row looks blank and prune/discard deletes real chats).
    if "payload_json" not in row:
        is_empty = False
        streaming = False
        payload = None
    else:
        try:
            payload = json.loads(raw_payload or "{}")
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
