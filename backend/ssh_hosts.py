"""Persist SSH host configs under data/ssh_hosts.yaml (not committed secrets)."""

from __future__ import annotations

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


def _ensure_dir() -> None:
    _HOSTS_PATH.parent.mkdir(parents=True, exist_ok=True)


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
        }
        if include_secrets:
            item["password"] = str(h.get("password") or "")
        else:
            item["has_password"] = bool(str(h.get("password") or "").strip())
        if item["id"]:
            out.append(item)
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
