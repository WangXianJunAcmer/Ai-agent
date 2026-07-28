"""SSH remote workspace via paramiko (SFTP + exec)."""

from __future__ import annotations

import posixpath
import threading
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse

from fastapi import HTTPException

from backend.ssh_hosts import get_host

_CLIENTS: dict[str, Any] = {}
_OS_CACHE: dict[str, dict] = {}
_LOCK = threading.Lock()
_MAX_READ = 400_000
_MAX_WRITE = 1_000_000
_MAX_TREE = 800
_SKIP = {
    ".git",
    ".svn",
    ".hg",
    ".venv",
    "venv",
    "node_modules",
    "__pycache__",
    ".ai-agent-uploads",
    ".cursor",
    "dist",
    "build",
    ".next",
}


def is_ssh_uri(raw: str | None) -> bool:
    return str(raw or "").strip().lower().startswith("ssh://")


def parse_ssh_uri(raw: str) -> tuple[str, str]:
    text = str(raw or "").strip()
    if not is_ssh_uri(text):
        raise HTTPException(status_code=400, detail="不是 SSH 工作区")
    # ssh://hostId/abs/path  or ssh://hostId/
    parsed = urlparse(text)
    host_id = unquote(parsed.netloc or "").strip()
    path = unquote(parsed.path or "/") or "/"
    if not host_id:
        # allow ssh:///id/path mistake → try path first segment
        parts = [p for p in path.split("/") if p]
        if not parts:
            raise HTTPException(status_code=400, detail="SSH URI 缺少主机 id")
        host_id = parts[0]
        path = "/" + "/".join(parts[1:]) if len(parts) > 1 else "/"
    if not path.startswith("/"):
        path = "/" + path
    path = posixpath.normpath(path)
    if path == ".":
        path = "/"
    return host_id, path


def format_ssh_uri(host_id: str, remote_path: str) -> str:
    hid = str(host_id or "").strip()
    path = posixpath.normpath(str(remote_path or "/").strip() or "/")
    if not path.startswith("/"):
        path = "/" + path
    return f"ssh://{hid}{path}"


def normalize_ssh_workspace(raw: str) -> str:
    host_id, path = parse_ssh_uri(raw)
    get_host(host_id, include_secrets=False)  # exists check
    return format_ssh_uri(host_id, path)


def _connect(host: dict):
    try:
        import paramiko
    except ImportError as err:
        raise HTTPException(
            status_code=500,
            detail="未安装 paramiko，请 pip install paramiko",
        ) from err

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    kwargs: dict[str, Any] = {
        "hostname": host["host"],
        "port": int(host.get("port") or 22),
        "username": host["user"],
        "timeout": 20,
        "allow_agent": True,
        "look_for_keys": True,
    }
    auth = str(host.get("auth") or "key").lower()
    if auth == "password":
        kwargs["password"] = str(host.get("password") or "")
        kwargs["look_for_keys"] = False
        kwargs["allow_agent"] = False
    else:
        key_path = str(host.get("key_path") or "").strip()
        if key_path:
            expanded = str(Path(key_path).expanduser())
            kwargs["key_filename"] = expanded
    try:
        client.connect(**kwargs)
    except Exception as err:  # noqa: BLE001 — surface to UI
        raise HTTPException(status_code=400, detail=f"SSH 连接失败: {err}") from err
    return client


def get_client(host_id: str):
    hid = str(host_id or "").strip()
    with _LOCK:
        client = _CLIENTS.get(hid)
        if client is not None:
            transport = client.get_transport()
            if transport is not None and transport.is_active():
                return client
            try:
                client.close()
            except Exception:
                pass
            _CLIENTS.pop(hid, None)
            _OS_CACHE.pop(hid, None)
        host = get_host(hid, include_secrets=True)
        client = _connect(host)
        _CLIENTS[hid] = client
        _OS_CACHE.pop(hid, None)
        return client


def drop_client(host_id: str) -> None:
    hid = str(host_id or "").strip()
    with _LOCK:
        client = _CLIENTS.pop(hid, None)
        _OS_CACHE.pop(hid, None)
    if client is not None:
        try:
            client.close()
        except Exception:
            pass


def _exec_raw(client, command: str, *, timeout: float = 12.0) -> tuple[int, bytes, bytes]:
    _stdin, stdout, stderr = client.exec_command(command, timeout=timeout, get_pty=False)
    out_b = stdout.read() or b""
    err_b = stderr.read() or b""
    code = stdout.channel.recv_exit_status()
    return code, out_b, err_b


def _decode_remote(data: bytes) -> str:
    if not data:
        return ""
    for enc in ("utf-8", "gbk", "cp936", "latin-1"):
        try:
            return data.decode(enc)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace")


def detect_remote_os(host_id: str, *, force: bool = False) -> dict:
    """Probe remote OS once per connection; decide cmd.exe vs bash/sh."""
    hid = str(host_id or "").strip()
    with _LOCK:
        cached = _OS_CACHE.get(hid)
        if cached and not force:
            return dict(cached)

    client = get_client(hid)

    def _cache(info: dict) -> dict:
        with _LOCK:
            _OS_CACHE[hid] = dict(info)
        return dict(info)

    # 1) Unix / Linux / macOS
    try:
        code, out_b, _err = _exec_raw(client, "uname -s", timeout=10)
        uname = _decode_remote(out_b).strip()
        if code == 0 and uname and "windows" not in uname.lower():
            system = uname.lower()
            shell = "bash"
            label = uname
            if "linux" in system:
                label = "Linux"
            elif "darwin" in system:
                label = "macOS"
            return _cache({
                "family": "unix",
                "system": system,
                "shell": shell,
                "label": label,
                "uname": uname,
            })
    except Exception:
        pass

    # 2) Windows OpenSSH → prefer real cmd.exe (not PowerShell)
    win_probes = (
        'cmd.exe /d /s /c "echo %OS%"',
        "cmd /d /s /c echo %OS%",
    )
    for probe in win_probes:
        try:
            code, out_b, _err = _exec_raw(client, probe, timeout=10)
            text = _decode_remote(out_b).strip()
            if code == 0 and "windows" in text.lower():
                ver = ""
                try:
                    vcode, vout, _ = _exec_raw(
                        client, 'cmd.exe /d /s /c ver', timeout=10
                    )
                    if vcode == 0:
                        ver = _decode_remote(vout).strip().replace("\r", "")
                except Exception:
                    ver = ""
                return _cache({
                    "family": "windows",
                    "system": "windows",
                    "shell": "cmd",
                    "label": "Windows",
                    "ver": ver,
                    "os_env": text,
                })
        except Exception:
            continue

    # 3) Fallback: treat as Unix sh
    return _cache({
        "family": "unix",
        "system": "unknown",
        "shell": "sh",
        "label": "Unix",
    })


def _posix_ssh_path_to_win(path: str) -> str:
    """Map OpenSSH-style /C:/Users/... (or /c/Users) to Windows cmd path."""
    import re

    raw = (path or "").replace("\\", "/").strip() or "/"
    m = re.match(r"^/([A-Za-z]):(/.*)?$", raw)
    if m:
        rest = (m.group(2) or "/").replace("/", "\\")
        if rest == "\\":
            return m.group(1).upper() + ":\\"
        return m.group(1).upper() + ":" + rest
    m2 = re.match(r"^/([A-Za-z])(/.*)?$", raw)
    if m2:
        rest = (m2.group(2) or "/").replace("/", "\\")
        return m2.group(1).upper() + ":" + (rest if rest else "\\")
    if re.match(r"^[A-Za-z]:", raw):
        return raw.replace("/", "\\")
    return raw.replace("/", "\\")


def _cmd_exe_quote(arg: str) -> str:
    return '"' + str(arg).replace('"', '""') + '"'


def test_connection(host_id: str) -> dict:
    drop_client(host_id)
    client = get_client(host_id)
    host = get_host(host_id, include_secrets=False)
    default = host.get("default_path") or "/"
    sftp = client.open_sftp()
    try:
        sftp.listdir(default)
    except OSError:
        default = "/"
        try:
            sftp.listdir("/")
        except OSError:
            # Windows OpenSSH often has no POSIX "/" listing; keep configured default.
            default = host.get("default_path") or "C:/"
    finally:
        sftp.close()
    remote_os = detect_remote_os(host_id)
    return {
        "ok": True,
        "id": host_id,
        "label": host.get("label") or host_id,
        "default_path": default,
        "os": remote_os,
        "shell": remote_os.get("shell"),
        "os_family": remote_os.get("family"),
        "os_label": remote_os.get("label"),
    }


def _safe_remote(root: str, rel: str) -> str:
    root_n = posixpath.normpath(root or "/")
    rel_n = (rel or ".").replace("\\", "/").strip() or "."
    if rel_n in {".", ""}:
        return root_n
    if rel_n.startswith("/"):
        # absolute within remote — still require under root
        candidate = posixpath.normpath(rel_n)
    else:
        candidate = posixpath.normpath(posixpath.join(root_n, rel_n))
    root_prefix = root_n if root_n.endswith("/") else root_n + "/"
    if candidate != root_n and not candidate.startswith(root_prefix):
        raise HTTPException(status_code=400, detail="路径越界")
    return candidate


def list_tree(host_id: str, root: str, rel: str = ".", *, depth: int = 2) -> dict:
    client = get_client(host_id)
    sftp = client.open_sftp()
    base = _safe_remote(root, rel)
    entries: list[dict] = []
    count = 0

    def walk(abs_path: str, prefix: str, level: int) -> None:
        nonlocal count
        if count >= _MAX_TREE or level > depth:
            return
        try:
            children = sorted(sftp.listdir_attr(abs_path), key=lambda a: (not _is_dir(a), a.filename.lower()))
        except OSError:
            return
        for attr in children:
            if count >= _MAX_TREE:
                break
            name = attr.filename
            if name in _SKIP:
                continue
            if name.startswith(".") and name not in {".gitignore", ".env.example"}:
                continue
            child_abs = posixpath.join(abs_path, name)
            rel_path = name if prefix in {"", "."} else f"{prefix}/{name}"
            is_dir = _is_dir(attr)
            entries.append(
                {
                    "name": name,
                    "path": rel_path.replace("\\", "/"),
                    "type": "dir" if is_dir else "file",
                }
            )
            count += 1
            if is_dir and level < depth:
                walk(child_abs, rel_path, level + 1)

    try:
        walk(base, "." if rel in {"", "."} else rel.replace("\\", "/"), 1)
    finally:
        sftp.close()
    return {
        "root": format_ssh_uri(host_id, root),
        "path": (rel or ".").replace("\\", "/"),
        "entries": entries,
        "truncated": count >= _MAX_TREE,
        "ssh": True,
        "host_id": host_id,
    }


def _is_dir(attr) -> bool:
    import stat

    try:
        return stat.S_ISDIR(attr.st_mode)
    except Exception:
        return False


def read_file(host_id: str, root: str, rel: str) -> dict:
    client = get_client(host_id)
    path = _safe_remote(root, rel)
    sftp = client.open_sftp()
    try:
        with sftp.open(path, "rb") as fh:
            data = fh.read(_MAX_READ + 1)
    except OSError as err:
        raise HTTPException(status_code=404, detail=f"文件不存在: {err}") from err
    finally:
        sftp.close()
    if len(data) > _MAX_READ:
        raise HTTPException(status_code=400, detail=f"文件过大（>{_MAX_READ} bytes）")
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError as err:
        raise HTTPException(status_code=400, detail="暂不支持二进制文件预览") from err
    return {
        "root": format_ssh_uri(host_id, root),
        "path": rel.replace("\\", "/"),
        "content": text,
        "size": len(data),
        "ssh": True,
    }


def write_file(host_id: str, root: str, rel: str, content: str) -> dict:
    if content is None:
        raise HTTPException(status_code=422, detail="content required")
    raw = content.encode("utf-8")
    if len(raw) > _MAX_WRITE:
        raise HTTPException(status_code=400, detail=f"内容过大（>{_MAX_WRITE} bytes）")
    client = get_client(host_id)
    path = _safe_remote(root, rel)
    parent = posixpath.dirname(path)
    sftp = client.open_sftp()
    try:
        _mkdir_p(sftp, parent)
        with sftp.open(path, "wb") as fh:
            fh.write(raw)
    except OSError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    finally:
        sftp.close()
    return {"ok": True, "root": format_ssh_uri(host_id, root), "path": rel.replace("\\", "/"), "ssh": True}


def create_dir(host_id: str, root: str, rel: str) -> dict:
    client = get_client(host_id)
    path = _safe_remote(root, rel)
    sftp = client.open_sftp()
    try:
        try:
            sftp.stat(path)
            raise HTTPException(status_code=409, detail="已存在同名文件或目录")
        except OSError:
            pass
        _mkdir_p(sftp, path)
    except HTTPException:
        raise
    except OSError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    finally:
        sftp.close()
    return {
        "ok": True,
        "root": format_ssh_uri(host_id, root),
        "path": rel.replace("\\", "/"),
        "abs_path": format_ssh_uri(host_id, path),
        "type": "dir",
        "ssh": True,
    }


def _mkdir_p(sftp, path: str) -> None:
    path = posixpath.normpath(path)
    if path in {"/", ""}:
        return
    parts = []
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
            sftp.mkdir(p)


def run_command(
    host_id: str,
    root: str,
    command: str,
    *,
    cwd: str | None = None,
    timeout: float = 30.0,
) -> dict:
    """Run one line on the remote host using the remote OS shell (cmd or bash/sh)."""
    import shlex

    cmd = (command or "").strip()
    if not cmd:
        raise HTTPException(status_code=422, detail="command required")
    if len(cmd) > 4000:
        raise HTTPException(status_code=400, detail="命令过长")
    base = (root or "/").strip() or "/"
    work = (cwd or "").strip() or base
    # Keep cwd under the SSH workspace root when relative.
    if work and not work.startswith("/") and not (len(work) >= 2 and work[1] == ":"):
        work = base.rstrip("/") + "/" + work.lstrip("/")
    if not work.startswith("/") and not (len(work) >= 2 and work[1] == ":"):
        work = "/" + work

    remote_os = detect_remote_os(host_id)
    family = str(remote_os.get("family") or "unix")
    # Normalize ".." / redundant slashes so cd lands on the real path.
    # Intentionally allow cwd outside the SSH workspace root (user may cd ..).
    work = posixpath.normpath(work.replace("\\", "/")) or "/"

    client = get_client(host_id)

    if family == "windows":
        win_cwd = _posix_ssh_path_to_win(work)
        # Explicit cmd.exe — do not use remote PowerShell default shell.
        inner = f"cd /d {_cmd_exe_quote(win_cwd)} & {cmd}"
        wrapped = "cmd.exe /d /s /c " + _cmd_exe_quote(inner)
        shell_name = "cmd"
    else:
        remote_script = (
            "export FORCE_COLOR=1 CLICOLOR_FORCE=1 TERM=xterm-256color LANG=${LANG:-C.UTF-8}; "
            f"cd {shlex.quote(work)} || exit 1; "
            f"{{ {cmd}; }}"
        )
        wrapped = (
            "if command -v bash >/dev/null 2>&1; then "
            f"bash -lc {shlex.quote(remote_script)}; "
            "else "
            f"sh -c {shlex.quote(remote_script)}; "
            "fi"
        )
        shell_name = str(remote_os.get("shell") or "bash")

    try:
        code, out_b, err_b = _exec_raw(
            client, wrapped, timeout=max(1.0, min(timeout, 120.0))
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"远程命令失败: {exc}") from exc

    out = _decode_remote(out_b)
    err = _decode_remote(err_b)
    text = out + (("\n" + err) if err else "")
    if len(text) > 200_000:
        text = text[:200_000] + "\n…(truncated)"
    return {
        "ok": True,
        "root": format_ssh_uri(host_id, root),
        "cwd": work,
        "command": cmd,
        "shell": shell_name,
        "os_family": family,
        "os_label": remote_os.get("label") or family,
        "exit_code": code,
        "output": text,
        "ssh": True,
    }


def path_info(host_id: str, root: str, rel: str) -> dict:
    client = get_client(host_id)
    path = _safe_remote(root, rel)
    sftp = client.open_sftp()
    try:
        st = sftp.stat(path)
        is_dir = _is_dir(st)
        exists = True
    except OSError:
        is_dir = False
        exists = False
    finally:
        sftp.close()
    rel_out = "." if path == posixpath.normpath(root) else posixpath.relpath(path, root)
    return {
        "ok": True,
        "root": format_ssh_uri(host_id, root),
        "path": rel_out.replace("\\", "/"),
        "abs_path": format_ssh_uri(host_id, path),
        "type": "dir" if is_dir else "file",
        "exists": exists,
        "ssh": True,
    }


def create_file(host_id: str, root: str, rel: str, content: str = "") -> dict:
    """Create a new file; 409 if path already exists (match local workspace.create_file)."""
    raw = (content or "").encode("utf-8")
    if len(raw) > _MAX_WRITE:
        raise HTTPException(status_code=400, detail=f"内容过大（>{_MAX_WRITE} bytes）")
    client = get_client(host_id)
    path = _safe_remote(root, rel)
    sftp = client.open_sftp()
    try:
        try:
            sftp.stat(path)
            raise HTTPException(status_code=409, detail="已存在同名文件或目录")
        except OSError:
            pass
        parent = posixpath.dirname(path)
        _mkdir_p(sftp, parent)
        with sftp.open(path, "wb") as fh:
            fh.write(raw)
    except HTTPException:
        raise
    except OSError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    finally:
        sftp.close()
    return {
        "ok": True,
        "root": format_ssh_uri(host_id, root),
        "path": rel.replace("\\", "/"),
        "abs_path": format_ssh_uri(host_id, path),
        "type": "file",
        "ssh": True,
    }


def delete_entry(host_id: str, root: str, rel: str) -> dict:
    client = get_client(host_id)
    path = _safe_remote(root, rel)
    if path == posixpath.normpath(root):
        raise HTTPException(status_code=400, detail="不能删除工作区根目录")
    sftp = client.open_sftp()
    try:
        st = sftp.stat(path)
        if _is_dir(st):
            _rm_tree(sftp, path)
        else:
            sftp.remove(path)
    except HTTPException:
        raise
    except OSError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    finally:
        sftp.close()
    return {"ok": True, "root": format_ssh_uri(host_id, root), "path": rel.replace("\\", "/"), "ssh": True}


def _rm_tree(sftp, path: str) -> None:
    """Recursively delete a remote directory (match local shutil.rmtree)."""
    for attr in sftp.listdir_attr(path):
        child = posixpath.join(path, attr.filename)
        if _is_dir(attr):
            _rm_tree(sftp, child)
        else:
            sftp.remove(child)
    sftp.rmdir(path)


def rename_entry(host_id: str, root: str, rel: str, new_name: str) -> dict:
    name = posixpath.basename(str(new_name or "").strip().replace("\\", "/"))
    if not name or name in {".", ".."}:
        raise HTTPException(status_code=422, detail="无效的新名称")
    rel_n = (rel or ".").replace("\\", "/")
    parent = posixpath.dirname(rel_n)
    dest_rel = name if parent in {"", "."} else posixpath.join(parent, name)
    client = get_client(host_id)
    src = _safe_remote(root, rel_n)
    dest = _safe_remote(root, dest_rel)
    sftp = client.open_sftp()
    try:
        try:
            sftp.stat(dest)
            raise HTTPException(status_code=409, detail="目标已存在")
        except OSError:
            pass
        sftp.rename(src, dest)
    except HTTPException:
        raise
    except OSError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    finally:
        sftp.close()
    return {
        "ok": True,
        "root": format_ssh_uri(host_id, root),
        "path": posixpath.relpath(dest, root).replace("\\", "/"),
        "ssh": True,
    }


def git_info_remote(host_id: str, root: str) -> dict:
    result = run_command(host_id, root, "git rev-parse --abbrev-ref HEAD", timeout=8)
    out = str(result.get("output") or "").strip().splitlines()
    branch = out[0].strip() if out else ""
    low = branch.lower()
    if result.get("exit_code") != 0 or not branch or "fatal" in low or "not a git" in low:
        return {
            "ok": True,
            "root": format_ssh_uri(host_id, root),
            "is_repo": False,
            "branch": None,
            "ssh": True,
        }
    return {
        "ok": True,
        "root": format_ssh_uri(host_id, root),
        "is_repo": True,
        "branch": branch,
        "ssh": True,
    }
