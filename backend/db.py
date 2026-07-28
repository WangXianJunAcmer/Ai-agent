"""SQLite connection, schema, and admin seed."""

from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

from passlib.hash import pbkdf2_sha256

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DB = ROOT / "data" / "coding_agent.db"
_LEGACY_DB = ROOT / "data" / "ai_agent.db"

ADMIN_USERNAME = "Admin"
ADMIN_PASSWORD = "123456"


def _migrate_legacy_db_file() -> None:
    """One-shot rename from Ai-agent era filename."""
    if DEFAULT_DB.exists() or not _LEGACY_DB.exists():
        return
    try:
        DEFAULT_DB.parent.mkdir(parents=True, exist_ok=True)
        _LEGACY_DB.rename(DEFAULT_DB)
    except OSError:
        pass


def database_path() -> Path:
    raw = (os.getenv("DATABASE_URL") or "").strip()
    if raw.startswith("sqlite:///"):
        rel = raw[len("sqlite:///") :]
        path = Path(rel)
        if not path.is_absolute():
            path = (ROOT / path).resolve()
        return path
    _migrate_legacy_db_file()
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


def _table_columns(conn: sqlite3.Connection, table: str) -> set[str]:
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return {str(r[1]) for r in rows}


def _conversations_has_user_provider_unique(conn: sqlite3.Connection) -> bool:
    indexes = conn.execute("PRAGMA index_list(conversations)").fetchall()
    for idx in indexes:
        if not bool(idx[2]):
            continue
        name = idx[1]
        info = conn.execute(f"PRAGMA index_info({name})").fetchall()
        col_names = [c[2] for c in info]
        if col_names == ["user_id", "provider"]:
            return True
    return False


def _migrate_conversations(conn: sqlite3.Connection) -> None:
    """Upgrade single-slot conversations (UNIQUE user+provider) → multi-chat list."""
    exists = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='conversations'"
    ).fetchone()
    if exists is None:
        return
    cols = _table_columns(conn, "conversations")
    needs_rebuild = (
        "title" not in cols
        or "created_at" not in cols
        or _conversations_has_user_provider_unique(conn)
    )
    if not needs_rebuild:
        return

    has_title = "title" in cols
    has_created = "created_at" in cols
    title_expr = (
        "COALESCE(NULLIF(trim(title), ''), '新对话')"
        if has_title
        else (
            "COALESCE(NULLIF(trim(json_extract(payload_json, '$.messages[0].text')), ''), "
            "'新对话')"
        )
    )
    created_expr = (
        "COALESCE(created_at, updated_at, datetime('now'))"
        if has_created
        else "COALESCE(updated_at, datetime('now'))"
    )
    conn.executescript(
        f"""
        CREATE TABLE conversations_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          provider TEXT NOT NULL,
          title TEXT NOT NULL DEFAULT '新对话',
          agent_session_id TEXT NOT NULL DEFAULT '',
          model TEXT NOT NULL DEFAULT '',
          payload_json TEXT NOT NULL DEFAULT '{{}}',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        INSERT INTO conversations_new (
          id, user_id, provider, title, agent_session_id, model, payload_json,
          created_at, updated_at
        )
        SELECT
          id,
          user_id,
          provider,
          {title_expr},
          agent_session_id,
          model,
          payload_json,
          {created_expr},
          COALESCE(updated_at, datetime('now'))
        FROM conversations;

        DROP TABLE conversations;
        ALTER TABLE conversations_new RENAME TO conversations;
        CREATE INDEX IF NOT EXISTS idx_conversations_user_provider
          ON conversations(user_id, provider);
        CREATE INDEX IF NOT EXISTS idx_conversations_updated
          ON conversations(updated_at);
        """
    )


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
              title TEXT NOT NULL DEFAULT '新对话',
              workspace_root TEXT NOT NULL DEFAULT '',
              agent_session_id TEXT NOT NULL DEFAULT '',
              model TEXT NOT NULL DEFAULT '',
              payload_json TEXT NOT NULL DEFAULT '{}',
              pinned INTEGER NOT NULL DEFAULT 0,
              archived INTEGER NOT NULL DEFAULT 0,
              created_at TEXT NOT NULL DEFAULT (datetime('now')),
              updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens(user_id);
            CREATE INDEX IF NOT EXISTS idx_conversations_user_provider
              ON conversations(user_id, provider);
            CREATE INDEX IF NOT EXISTS idx_conversations_updated
              ON conversations(updated_at);
            """
        )
        _migrate_conversations(conn)
        cols = _table_columns(conn, "conversations")
        if "workspace_root" not in cols:
            conn.execute(
                "ALTER TABLE conversations ADD COLUMN workspace_root TEXT NOT NULL DEFAULT ''"
            )
        cols = _table_columns(conn, "conversations")
        if "pinned" not in cols:
            conn.execute(
                "ALTER TABLE conversations ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0"
            )
        if "archived" not in cols:
            conn.execute(
                "ALTER TABLE conversations ADD COLUMN archived INTEGER NOT NULL DEFAULT 0"
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
