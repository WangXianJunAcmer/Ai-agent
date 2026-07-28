"""User registration, login, and token helpers."""

from __future__ import annotations

import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException, Request
from passlib.hash import pbkdf2_sha256

from backend.db import db_session

_USERNAME_RE = re.compile(r"^[A-Za-z0-9_\u4e00-\u9fff]{2,32}$")
TOKEN_COOKIE = "coding_agent_token"
LEGACY_TOKEN_COOKIE = "ai_agent_token"
SESSION_DAYS = 7
REMEMBER_DAYS = 30


def normalize_username(username: str) -> str:
    return (username or "").strip().lower()


def validate_username(username: str) -> str:
    raw = (username or "").strip()
    if not raw or not _USERNAME_RE.match(raw):
        raise HTTPException(
            status_code=422,
            detail="用户名需为 2–32 位字母、数字、下划线或中文",
        )
    return raw


def validate_password(password: str) -> str:
    if not password or len(password) < 6:
        raise HTTPException(status_code=422, detail="密码至少 6 位")
    if len(password) > 128:
        raise HTTPException(status_code=422, detail="密码过长")
    return password


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _fmt(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def _parse_dt(value: str) -> datetime:
    return datetime.strptime(value, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)


def user_public(row: Any) -> dict:
    return {
        "id": int(row["id"]),
        "username": row["username"],
        "is_admin": bool(row["is_admin"]),
    }


def get_user_by_norm(username_norm: str) -> dict | None:
    with db_session() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE username_norm = ?",
            (username_norm,),
        ).fetchone()
        return dict(row) if row else None


def create_user(username: str, password: str, *, is_admin: bool = False) -> dict:
    display = validate_username(username)
    pwd = validate_password(password)
    norm = normalize_username(display)
    if get_user_by_norm(norm):
        raise HTTPException(status_code=409, detail="用户名已存在")
    with db_session() as conn:
        cur = conn.execute(
            """
            INSERT INTO users (username, username_norm, password_hash, is_admin)
            VALUES (?, ?, ?, ?)
            """,
            (display, norm, pbkdf2_sha256.hash(pwd), 1 if is_admin else 0),
        )
        user_id = int(cur.lastrowid)
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        return dict(row)


def verify_login(username: str, password: str) -> dict:
    norm = normalize_username(username)
    if not norm or not password:
        raise HTTPException(status_code=422, detail="请输入用户名和密码")
    user = get_user_by_norm(norm)
    if user is None or not pbkdf2_sha256.verify(password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    return user


def issue_token(user_id: int, *, remember: bool) -> tuple[str, datetime]:
    token = secrets.token_urlsafe(32)
    days = REMEMBER_DAYS if remember else SESSION_DAYS
    expires = _utcnow() + timedelta(days=days)
    with db_session() as conn:
        conn.execute(
            """
            INSERT INTO auth_tokens (token, user_id, expires_at)
            VALUES (?, ?, ?)
            """,
            (token, user_id, _fmt(expires)),
        )
    return token, expires


def revoke_token(token: str | None) -> None:
    if not token:
        return
    with db_session() as conn:
        conn.execute("DELETE FROM auth_tokens WHERE token = ?", (token,))


def user_from_token(token: str | None) -> dict | None:
    if not token:
        return None
    with db_session() as conn:
        row = conn.execute(
            """
            SELECT u.*, t.expires_at AS token_expires
            FROM auth_tokens t
            JOIN users u ON u.id = t.user_id
            WHERE t.token = ?
            """,
            (token,),
        ).fetchone()
        if row is None:
            return None
        try:
            if _parse_dt(row["token_expires"]) < _utcnow():
                conn.execute("DELETE FROM auth_tokens WHERE token = ?", (token,))
                return None
        except ValueError:
            conn.execute("DELETE FROM auth_tokens WHERE token = ?", (token,))
            return None
        return dict(row)


def extract_token(request: Request) -> str | None:
    auth = request.headers.get("Authorization") or ""
    if auth.lower().startswith("bearer "):
        token = auth[7:].strip()
        if token:
            return token
    cookie = request.cookies.get(TOKEN_COOKIE)
    if cookie:
        return cookie.strip()
    # WebSocket cannot set Authorization; clients may pass ?token=
    try:
        q = request.query_params.get("token")
    except Exception:
        q = None
    if q:
        return str(q).strip() or None
    return None


def current_user(request: Request) -> dict | None:
    return user_from_token(extract_token(request))


def require_user(request: Request) -> dict:
    user = current_user(request)
    if user is None:
        raise HTTPException(status_code=401, detail="未登录")
    return user