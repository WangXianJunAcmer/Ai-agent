"""Persist SSH host configs under data/ssh_hosts.yaml (not committed secrets).

Also discovers Host entries from the user's ~/.ssh/config (Cursor-style).
"""

from __future__ import annotations

import getpass
import os
import re
import threading
from pathlib import Path
from typing import Any

import yaml
from fastapi import HTTPException

from backend.config import ROOT

_LOCK = threading.Lock()
_HOSTS_PATH = ROOT / "data" / "ssh_hosts.yaml"
_ID_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$")
_HOST_WILDCARD = re.compile(r"[*?]")


def _ensure_dir() -> None:
    _HOSTS_PATH.parent.mkdir(parents=True, exist_ok=True)


def _ssh_config_path() -> Path:
    override = (os.environ.get("CODING_AGENT_SSH_CONFIG") or "").strip()
    if override:
        return Path(override).expanduser()
    return Path.home() / ".ssh" / "config"


def _sanitize_host_id(alias: str) -> str:
    """Map SSH Host alias to our id charset; empty if unusable."""
    raw = str(alias or "").strip()
    if not raw or _HOST_WILDCARD.search(raw):
        return ""
    if _ID_RE.match(raw):
        return raw
    cleaned = re.sub(r"[^a-zA-Z0-9_-]+", "_", raw).strip("_")
    if not cleaned:
        return ""
    if cleaned[0].isdigit():
        cleaned = "h_" + cleaned
    return cleaned[:64]


def _parse_ssh_config_text(text: str, *, base_dir: Path) -> list[dict]:
    """Minimal OpenSSH config parser: Host / HostName / User / Port / IdentityFile / Include."""
    hosts: list[dict] = []
    pending_aliases: list[str] = []
    cur: dict[str, Any] | None = None

    def flush() -> None:
        nonlocal cur, pending_aliases
        if not cur:
            pending_aliases = []
            return
        hostname = str(cur.get("host") or "").strip()
        for alias in pending_aliases:
            hid = _sanitize_host_id(alias)
            if not hid:
                continue
            item = {
                "id": hid,
                "label": alias,
                "host": hostname or alias,
                "port": int(cur.get("port") or 22),
                "user": str(cur.get("user") or "").strip() or getpass.getuser(),
                "auth": "key",
                "key_path": str(cur.get("key_path") or "").strip(),
                "default_path": "/",
                "source": "config",
                "has_password": False,
            }
            hosts.append(item)
        cur = None
        pending_aliases = []

    lines = text.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        i += 1
        raw = line.strip()
        if not raw or raw.startswith("#"):
            continue
        # Strip inline comments when not inside quotes (good enough).
        if "#" in raw and '"' not in raw and "'" not in raw:
            raw = raw.split("#", 1)[0].strip()
            if not raw:
                continue
        parts = raw.split(None, 1)
        if not parts:
            continue
        key = parts[0].lower()
        val = parts[1].strip().strip('"').strip("'") if len(parts) > 1 else ""

        if key == "include":
            flush()
            for pattern in raw.split(None)[1:]:
                pat = pattern.strip().strip('"').strip("'")
                if not pat:
                    continue
                path = Path(pat).expanduser()
                if not path.is_absolute():
                    path = (base_dir / pat).expanduser()
                # OpenSSH Include supports globs.
                matched = sorted(path.parent.glob(path.name)) if any(c in path.name for c in "*?[") else [path]
                for inc in matched:
                    if not inc.is_file():
                        continue
                    try:
                        nested = _parse_ssh_config_text(
                            inc.read_text(encoding="utf-8", errors="replace"),
                            base_dir=inc.parent,
                        )
                    except OSError:
                        continue
                    hosts.extend(nested)
            continue

        if key == "host":
            flush()
            pending_aliases = [a for a in val.split() if a]
            cur = {}
            continue

        if cur is None:
            continue
        if key == "hostname" and val:
            cur["host"] = val
        elif key == "user" and val:
            cur["user"] = val
        elif key == "port" and val:
            try:
                cur["port"] = int(val)
            except ValueError:
                pass
        elif key == "identityfile" and val and not cur.get("key_path"):
            # First IdentityFile wins (same as common Cursor/VS Code pick).
            cur["key_path"] = str(Path(val).expanduser())

    flush()
    # Dedupe by id, first wins (main config before later Include noise).
    seen: set[str] = set()
    out: list[dict] = []
    for h in hosts:
        hid = h["id"]
        if hid in seen:
            continue
        seen.add(hid)
        out.append(h)
    return out


def list_config_hosts() -> list[dict]:
    """Read ~/.ssh/config Host entries (no private key contents)."""
    path = _ssh_config_path()
    if not path.is_file():
        return []
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return []
    return _parse_ssh_config_text(text, base_dir=path.parent)


def _read_raw() -> dict:
    _ensure_dir()
    if not _HOSTS_PATH.is_file():
        return {"ssh_hosts": []}
    try:
        data = yaml.safe_load(_HOSTS_PATH.read_text(encoding="utf-8")) or {}
    except (OSError, yaml.YAMLError):
        return {"ssh_hosts": []}
    if not isinstance(data, dict):
        return {"ssh_hosts": []}
    hosts = data.get("ssh_hosts") or []
    if not isinstance(hosts, list):
        hosts = []
    data["ssh_hosts"] = hosts
    return data


def _write_raw(data: dict) -> None:
    _ensure_dir()
    text = yaml.safe_dump(data, allow_unicode=True, sort_keys=False)
    _HOSTS_PATH.write_text(text, encoding="utf-8")


def list_hosts(*, include_secrets: bool = False) -> list[dict]:
    with _LOCK:
        hosts = list(_read_raw().get("ssh_hosts") or [])
    out = []
    for h in hosts:
        if not isinstance(h, dict):
            continue
        item = {
            "id": str(h.get("id") or "").strip(),
            "label": str(h.get("label") or h.get("id") or "").strip(),
            "host": str(h.get("host") or "").strip(),
            "port": int(h.get("port") or 22),
            "user": str(h.get("user") or "").strip(),
            "auth": str(h.get("auth") or "key").strip().lower(),
            "key_path": str(h.get("key_path") or "").strip(),
            "default_path": str(h.get("default_path") or "/").strip() or "/",
            "source": "saved",
        }
        if include_secrets:
            item["password"] = str(h.get("password") or "")
        else:
            item["has_password"] = bool(str(h.get("password") or "").strip())
        if item["id"]:
            out.append(item)
    return out


def list_hosts_merged(*, include_secrets: bool = False) -> list[dict]:
    """Saved hosts first, then ~/.ssh/config Host aliases not already saved."""
    saved = list_hosts(include_secrets=include_secrets)
    seen = {h["id"] for h in saved}
    out = list(saved)
    for h in list_config_hosts():
        if h["id"] in seen:
            continue
        if include_secrets:
            h = {**h, "password": ""}
            h.pop("has_password", None)
        out.append(h)
        seen.add(h["id"])
    return out


def get_host(host_id: str, *, include_secrets: bool = True) -> dict:
    hid = str(host_id or "").strip()
    for h in list_hosts(include_secrets=include_secrets):
        if h["id"] == hid:
            if include_secrets and "password" not in h:
                # re-read with secrets
                with _LOCK:
                    for raw in _read_raw().get("ssh_hosts") or []:
                        if isinstance(raw, dict) and str(raw.get("id") or "") == hid:
                            h = {
                                **h,
                                "password": str(raw.get("password") or ""),
                                "key_path": str(raw.get("key_path") or h.get("key_path") or ""),
                            }
                            break
            return h
    # Cursor-style: connect using Host from ~/.ssh/config without manual save.
    for h in list_config_hosts():
        if h["id"] == hid:
            if include_secrets:
                return {**h, "password": ""}
            return h
    raise HTTPException(status_code=404, detail=f"SSH 主机不存在: {hid}")


def upsert_host(payload: dict[str, Any]) -> dict:
    hid = str(payload.get("id") or "").strip()
    if not hid or not _ID_RE.match(hid):
        raise HTTPException(status_code=422, detail="id 需为字母数字/_/-，且不超过 64 字符")
    host = str(payload.get("host") or "").strip()
    user = str(payload.get("user") or "").strip()
    if not host or not user:
        raise HTTPException(status_code=422, detail="host 与 user 必填")
    auth = str(payload.get("auth") or "key").strip().lower()
    if auth not in {"key", "password"}:
        raise HTTPException(status_code=422, detail="auth 仅为 key 或 password")
    item = {
        "id": hid,
        "label": str(payload.get("label") or hid).strip() or hid,
        "host": host,
        "port": int(payload.get("port") or 22),
        "user": user,
        "auth": auth,
        "key_path": str(payload.get("key_path") or "").strip(),
        "default_path": str(payload.get("default_path") or "/").strip() or "/",
    }
    password = payload.get("password")
    with _LOCK:
        data = _read_raw()
        hosts = [h for h in (data.get("ssh_hosts") or []) if isinstance(h, dict)]
        existing = None
        for h in hosts:
            if str(h.get("id") or "") == hid:
                existing = h
                break
        if password is not None:
            item["password"] = str(password)
        elif existing and existing.get("password"):
            item["password"] = existing.get("password")
        else:
            item["password"] = ""
        if not item["key_path"] and existing:
            item["key_path"] = str(existing.get("key_path") or "")
        hosts = [h for h in hosts if str(h.get("id") or "") != hid]
        hosts.append(item)
        data["ssh_hosts"] = hosts
        _write_raw(data)
    return get_host(hid, include_secrets=False)


def delete_host(host_id: str) -> None:
    hid = str(host_id or "").strip()
    with _LOCK:
        data = _read_raw()
        hosts = [
            h
            for h in (data.get("ssh_hosts") or [])
            if isinstance(h, dict) and str(h.get("id") or "") != hid
        ]
        if len(hosts) == len(data.get("ssh_hosts") or []):
            raise HTTPException(status_code=404, detail=f"SSH 主机不存在: {hid}")
        data["ssh_hosts"] = hosts
        _write_raw(data)
