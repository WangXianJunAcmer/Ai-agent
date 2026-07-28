"""SQLite connection, schema, and admin seed."""

from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

from passlib.hash import pbkdf2_sha256

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DB = ROOT / "data" / "ai_agent.db"

ADMIN_USERNAME = "Admin"
ADMIN_PASSWORD = "123456"


def database_path() -> Path:
    raw = (os.getenv("DATABASE_URL") or "").strip()
    if raw.startswith("sqlite:///"):
        rel = raw[len("sqlite:///") :]
        path = Path(rel)
        if not path.is_absolute():
            path = (ROOT / path).resolve()
        return path
    return DEFAULT_DB


def connect() -> sqlite3.Connection:
    path = database_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextmanager
def db_session():
    conn = connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    with db_session() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              username TEXT NOT NULL,
              username_norm TEXT NOT NULL UNIQUE,
              password_hash TEXT NOT NULL,
              is_admin INTEGER NOT NULL DEFAULT 0,
              created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS auth_tokens (
              token TEXT PRIMARY KEY,
              user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              expires_at TEXT NOT NULL,
              created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS conversations (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              provider TEXT NOT NULL,
              agent_session_id TEXT NOT NULL DEFAULT '',
              model TEXT NOT NULL DEFAULT '',
              payload_json TEXT NOT NULL DEFAULT '{}',
              updated_at TEXT NOT NULL DEFAULT (datetime('now')),
              UNIQUE(user_id, provider)
            );

            CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens(user_id);
            CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);
            """
        )
        row = conn.execute(
            "SELECT id, username FROM users WHERE username_norm = ?",
            (ADMIN_USERNAME.lower(),),
        ).fetchone()
        if row is None:
            conn.execute(
                """
                INSERT INTO users (username, username_norm, password_hash, is_admin)
                VALUES (?, ?, ?, 1)
                """,
                (
                    ADMIN_USERNAME,
                    ADMIN_USERNAME.lower(),
                    pbkdf2_sha256.hash(ADMIN_PASSWORD),
                ),
            )
        elif row["username"] != ADMIN_USERNAME:
            conn.execute(
                "UPDATE users SET username = ? WHERE id = ?",
                (ADMIN_USERNAME, int(row["id"])),
            )
