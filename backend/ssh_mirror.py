"""Local filesystem mirror of an ssh:// workspace for Cursor SDK cwd.

# ponytail: shallow SFTP pull + push-after-turn; not a full FUSE mount.
# Upgrade: sshfs/WinFsp or bidirectional watcher if mirrors get huge/stale.
"""

from __future__ import annotations

import hashlib
import json
import posixpath
import stat
import time
from pathlib import Path
from typing import Any

from backend.config import ROOT

META_NAME = ".coding-agent-ssh.json"
MIRROR_ROOT = ROOT / "data" / "ssh_mirrors"
_MAX_FILES = 500
_MAX_FILE_BYTES = 400_000
_MAX_DEPTH = 5
_SKIP = {
    ".git",
    ".svn",
    ".hg",
    ".venv",
    "venv",
    "node_modules",
    "__pycache__",
    ".coding-agent-uploads",
    ".cursor",
    "dist",
    "build",
    ".next",
    META_NAME,
}


def mirror_path_for(ssh_uri: str) -> Path:
    from backend.ssh_workspace import parse_ssh_uri

    host_id, remote = parse_ssh_uri(ssh_uri)
    digest = hashlib.sha1(remote.encode("utf-8")).hexdigest()[:16]
    safe_host = "".join(c if c.isalnum() or c in "-_" else "_" for c in host_id)[:64]
    return MIRROR_ROOT / safe_host / digest


def read_mirror_meta(local: Path) -> dict[str, Any] | None:
    meta = local / META_NAME
    if not meta.is_file():
        return None
    try:
        data = json.loads(meta.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return data if isinstance(data, dict) else None


def _write_meta(local: Path, *, ssh_uri: str, host_id: str, remote: str, files: int) -> None:
    payload = {
        "ssh_uri": ssh_uri,
        "host_id": host_id,
        "remote": remote,
        "files": files,
        "synced_at": time.time(),
    }
    (local / META_NAME).write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def ensure_mirror(ssh_uri: str, *, force: bool = False) -> Path:
    """Return a local directory Cursor can use as cwd; pull from SSH if needed."""
    from backend import ssh_workspace as ssh_ws

    host_id, remote = ssh_ws.parse_ssh_uri(ssh_uri)
    if remote in {"/", "", "."}:
        resolve = getattr(ssh_ws, "effective_default_path", None)
        if resolve is not None:
            remote = resolve(host_id)
        ssh_uri = ssh_ws.format_ssh_uri(host_id, remote)
    dest = mirror_path_for(ssh_uri)
    dest.mkdir(parents=True, exist_ok=True)
    meta = read_mirror_meta(dest)
    has_files = any(p.name != META_NAME for p in dest.iterdir()) if dest.is_dir() else False
    if has_files and meta and meta.get("ssh_uri") == ssh_uri and not force:
        return dest

    pulled = _pull_tree(host_id, remote, dest)
    _write_meta(dest, ssh_uri=ssh_uri, host_id=host_id, remote=remote, files=pulled)
    return dest


def refresh_mirror(ssh_uri: str) -> Path:
    return ensure_mirror(ssh_uri, force=True)


def push_mirror(ssh_uri: str, local: Path | None = None) -> dict[str, Any]:
    """Push local mirror files back to the remote SSH root."""
    from backend.ssh_workspace import get_client, parse_ssh_uri

    host_id, remote = parse_ssh_uri(ssh_uri)
    root = Path(local) if local else mirror_path_for(ssh_uri)
    if not root.is_dir():
        return {"ok": False, "pushed": 0, "detail": "mirror missing"}

    client = get_client(host_id)
    sftp = client.open_sftp()
    pushed = 0
    errors: list[str] = []
    meta_before = read_mirror_meta(root) or {}
    synced_at = float(meta_before.get("synced_at") or 0)
    try:
        for path in sorted(root.rglob("*")):
            if path.name == META_NAME or path.name in _SKIP:
                continue
            rel = path.relative_to(root).as_posix()
            if any(part in _SKIP for part in rel.split("/")):
                continue
            remote_path = remote.rstrip("/") + "/" + rel if remote not in {"/", ""} else "/" + rel
            try:
                if path.is_dir():
                    _mkdir_p(sftp, remote_path)
                    continue
                # Only upload files touched after last sync/pull.
                if synced_at and path.stat().st_mtime <= synced_at + 0.05:
                    continue
                data = path.read_bytes()
                parent = posixpath.dirname(remote_path)
                if parent in {".", ""}:
                    parent = remote if remote != "/" else "/"
                _mkdir_p(sftp, parent)
                with sftp.open(remote_path, "wb") as fh:
                    fh.write(data)
                pushed += 1
            except OSError as err:
                errors.append(f"{rel}: {err}")
                if len(errors) >= 20:
                    break
    finally:
        sftp.close()

    _write_meta(
        root,
        ssh_uri=ssh_uri,
        host_id=host_id,
        remote=remote,
        files=int(meta_before.get("files") or pushed),
    )
    return {"ok": not errors, "pushed": pushed, "errors": errors, "ssh_uri": ssh_uri}


def _pull_tree(host_id: str, remote: str, dest: Path) -> int:
    from backend.ssh_workspace import get_client

    client = get_client(host_id)
    sftp = client.open_sftp()
    count = 0
    try:
        count = _walk_pull(sftp, remote, dest, depth=0, count=0)
    finally:
        sftp.close()
    return count


def _walk_pull(sftp, remote_dir: str, local_dir: Path, *, depth: int, count: int) -> int:
    if count >= _MAX_FILES or depth > _MAX_DEPTH:
        return count
    local_dir.mkdir(parents=True, exist_ok=True)
    try:
        entries = sftp.listdir_attr(remote_dir)
    except OSError:
        return count
    for attr in sorted(entries, key=lambda a: a.filename.lower()):
        if count >= _MAX_FILES:
            break
        name = attr.filename
        if name in _SKIP or name.startswith("."):
            continue
        remote_child = remote_dir.rstrip("/") + "/" + name
        local_child = local_dir / name
        mode = int(getattr(attr, "st_mode", 0) or 0)
        if stat.S_ISDIR(mode):
            count = _walk_pull(sftp, remote_child, local_child, depth=depth + 1, count=count)
            continue
        size = int(getattr(attr, "st_size", 0) or 0)
        if size > _MAX_FILE_BYTES:
            continue
        try:
            with sftp.open(remote_child, "rb") as fh:
                data = fh.read(_MAX_FILE_BYTES + 1)
            if len(data) > _MAX_FILE_BYTES:
                continue
            local_child.write_bytes(data)
            count += 1
        except OSError:
            continue
    return count


def _mkdir_p(sftp, path: str) -> None:
    path = posixpath.normpath(path or "/")
    if path in {"/", "", "."}:
        return
    parts: list[str] = []
    cur = path
    while cur not in {"/", ""}:
        parts.append(cur)
        nxt = posixpath.dirname(cur)
        if nxt == cur:
            break
        cur = nxt
    for p in reversed(parts):
        try:
            sftp.stat(p)
        except OSError:
            try:
                sftp.mkdir(p)
            except OSError:
                pass
