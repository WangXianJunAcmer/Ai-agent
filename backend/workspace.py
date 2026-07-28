"""Workspace path helpers + filesystem listing/read/write for the IDE panel."""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

from fastapi import HTTPException


def resolve_in_root(host_root: Path, path: str) -> Path:
    """Resolve path under host_root; raise ValueError if it escapes the workspace."""
    raw = (path or "").strip() or "."
    candidate = (host_root / raw).resolve() if not Path(raw).is_absolute() else Path(raw).resolve()
    try:
        candidate.relative_to(host_root)
    except ValueError as err:
        raise ValueError(f"path escapes workspace: {path}") from err
    return candidate


def _safe_path(root: Path, rel: str) -> Path:
    try:
        return resolve_in_root(root, rel)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err

_SKIP_DIRS = {
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
    "ai",
}
_MAX_TREE_ENTRIES = 800
_MAX_READ = 400_000
_MAX_WRITE = 1_000_000
_MAX_IMAGE_READ = 8_000_000
_IMAGE_MIME = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".svg": "image/svg+xml",
}


def image_mime_for(name: str) -> str | None:
    ext = Path(str(name or "")).suffix.lower()
    return _IMAGE_MIME.get(ext)


def home_workspace() -> Path:
    return Path.home().resolve()


def default_workspace(settings: dict) -> Path:
    """UI / agent default root is Home (user profile), not the Coding Agent repo."""
    return home_workspace()


def is_home_workspace(root: Path | str | None) -> bool:
    if not root:
        return True
    try:
        return Path(root).resolve() == home_workspace()
    except OSError:
        return False


def resolve_workspace_root(raw: str | None, settings: dict) -> Path:
    text = (raw or "").strip()
    if text.lower().startswith("ssh://"):
        raise HTTPException(
            status_code=400,
            detail="SSH 工作区请使用 normalize_workspace_key / SSH API，不能当作本地 Path",
        )
    if not text:
        return default_workspace(settings)
    path = Path(text).expanduser()
    if not path.is_absolute():
        path = (Path(settings["root"]) / path).resolve()
    else:
        path = path.resolve()
    if not path.exists() or not path.is_dir():
        raise HTTPException(status_code=400, detail=f"工作区不存在或不是目录: {path}")
    return path


def normalize_workspace_key(raw: str | None, settings: dict) -> str:
    """Canonical workspace id: local absolute path or ssh://hostId/path."""
    text = (raw or "").strip()
    if text.lower().startswith("ssh://"):
        from backend.ssh_workspace import normalize_ssh_workspace

        return normalize_ssh_workspace(text)
    return str(resolve_workspace_root(text or None, settings))


def workspace_label(root: Path | str) -> str:
    text = str(root or "")
    if text.lower().startswith("ssh://"):
        from backend.ssh_workspace import parse_ssh_uri
        from backend.ssh_hosts import get_host

        try:
            host_id, _path = parse_ssh_uri(text)
            host = get_host(host_id, include_secrets=False)
            # Host only — remote folder belongs in URI / tooltip, not the repo title.
            return str(host.get("label") or host_id).strip() or host_id
        except Exception:
            return text
    try:
        path = Path(text)
    except OSError:
        return text or "Home"
    if is_home_workspace(path):
        return "Home"
    return path.name or str(path)


def list_tree(root: Path, rel: str = ".", *, depth: int = 2) -> dict:
    base = _safe_path(root, rel)
    if not base.exists():
        raise HTTPException(status_code=404, detail="路径不存在")
    if not base.is_dir():
        raise HTTPException(status_code=400, detail="不是目录")

    entries: list[dict] = []
    count = 0

    def walk(dir_path: Path, prefix: str, level: int) -> None:
        nonlocal count
        if count >= _MAX_TREE_ENTRIES or level > depth:
            return
        try:
            children = sorted(
                dir_path.iterdir(),
                key=lambda p: (not p.is_dir(), p.name.lower()),
            )
        except OSError:
            return
        for child in children:
            if count >= _MAX_TREE_ENTRIES:
                break
            name = child.name
            if name in _SKIP_DIRS:
                continue
            if name.startswith(".") and name not in {".gitignore", ".env.example"}:
                continue
            if prefix == ".":
                rel_path = name
            else:
                rel_path = f"{prefix}/{name}"
            item = {
                "name": name,
                "path": rel_path.replace("\\", "/"),
                "type": "dir" if child.is_dir() else "file",
            }
            entries.append(item)
            count += 1
            if child.is_dir() and level < depth:
                walk(child, item["path"], level + 1)

    walk(base, "." if rel in {"", "."} else rel.replace("\\", "/"), 1)
    return {
        "root": str(root),
        "path": (rel or ".").replace("\\", "/"),
        "entries": entries,
        "truncated": count >= _MAX_TREE_ENTRIES,
    }


def read_file(root: Path, rel: str) -> dict:
    import base64

    path = _safe_path(root, rel)
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="文件不存在")
    mime = image_mime_for(rel) or image_mime_for(path.name)
    limit = _MAX_IMAGE_READ if mime else _MAX_READ
    try:
        data = path.read_bytes()
    except OSError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    if len(data) > limit:
        raise HTTPException(status_code=400, detail=f"文件过大（>{limit} bytes）")
    if mime:
        return {
            "root": str(root),
            "path": rel.replace("\\", "/"),
            "content": "",
            "size": len(data),
            "media": "image",
            "mime": mime,
            "encoding": "base64",
            "data_base64": base64.b64encode(data).decode("ascii"),
        }
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="暂不支持二进制文件预览") from None
    return {
        "root": str(root),
        "path": rel.replace("\\", "/"),
        "content": text,
        "size": len(data),
    }


def write_file(root: Path, rel: str, content: str) -> dict:
    if content is None:
        raise HTTPException(status_code=422, detail="content required")
    if len(content.encode("utf-8")) > _MAX_WRITE:
        raise HTTPException(status_code=400, detail=f"内容过大（>{_MAX_WRITE} bytes）")
    path = _safe_path(root, rel)
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        path.write_text(content, encoding="utf-8", newline="\n")
    except OSError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    return {"ok": True, "root": str(root), "path": rel.replace("\\", "/")}


def create_file(root: Path, rel: str, content: str = "") -> dict:
    path = _safe_path(root, rel)
    if path.exists():
        raise HTTPException(status_code=409, detail="已存在同名文件或目录")
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        path.write_text(content or "", encoding="utf-8", newline="\n")
    except OSError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    return {
        "ok": True,
        "root": str(root),
        "path": rel.replace("\\", "/"),
        "abs_path": str(path),
        "type": "file",
    }


def create_dir(root: Path, rel: str) -> dict:
    path = _safe_path(root, rel)
    if path.exists():
        raise HTTPException(status_code=409, detail="已存在同名文件或目录")
    try:
        path.mkdir(parents=True, exist_ok=False)
    except OSError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    return {
        "ok": True,
        "root": str(root),
        "path": rel.replace("\\", "/"),
        "abs_path": str(path),
        "type": "dir",
    }


def rename_entry(root: Path, rel: str, new_name: str) -> dict:
    src = _safe_path(root, rel)
    name = (new_name or "").strip()
    if not name or "/" in name or "\\" in name or name in {".", ".."}:
        raise HTTPException(status_code=422, detail="无效名称")
    if not src.exists():
        raise HTTPException(status_code=404, detail="路径不存在")
    dest = src.parent / name
    try:
        dest.relative_to(root.resolve())
    except ValueError as err:
        raise HTTPException(status_code=400, detail="目标越界") from err
    if dest.exists():
        raise HTTPException(status_code=409, detail="目标已存在")
    try:
        src.rename(dest)
    except OSError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    new_rel = str(dest.relative_to(root.resolve())).replace("\\", "/")
    return {
        "ok": True,
        "root": str(root),
        "path": new_rel,
        "from": rel.replace("\\", "/"),
        "abs_path": str(dest),
        "type": "dir" if dest.is_dir() else "file",
    }


def delete_entry(root: Path, rel: str) -> dict:
    path = _safe_path(root, rel)
    if path.resolve() == root.resolve():
        raise HTTPException(status_code=400, detail="不能删除工作区根目录")
    if not path.exists():
        raise HTTPException(status_code=404, detail="路径不存在")
    try:
        if path.is_dir():
            shutil.rmtree(path)
        else:
            path.unlink()
    except OSError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    return {"ok": True, "root": str(root), "path": rel.replace("\\", "/")}


def copy_entry(root: Path, src_rel: str, dest_rel: str) -> dict:
    src = _safe_path(root, src_rel)
    dest = _safe_path(root, dest_rel)
    if not src.exists():
        raise HTTPException(status_code=404, detail="源路径不存在")
    if dest.exists():
        raise HTTPException(status_code=409, detail="目标已存在")
    dest.parent.mkdir(parents=True, exist_ok=True)
    try:
        if src.is_dir():
            shutil.copytree(src, dest)
        else:
            shutil.copy2(src, dest)
    except OSError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    return {
        "ok": True,
        "root": str(root),
        "path": dest_rel.replace("\\", "/"),
        "abs_path": str(dest),
        "type": "dir" if dest.is_dir() else "file",
    }


def move_entry(root: Path, src_rel: str, dest_rel: str) -> dict:
    src = _safe_path(root, src_rel)
    dest = _safe_path(root, dest_rel)
    if not src.exists():
        raise HTTPException(status_code=404, detail="源路径不存在")
    if dest.exists():
        raise HTTPException(status_code=409, detail="目标已存在")
    if src.resolve() == root.resolve():
        raise HTTPException(status_code=400, detail="不能移动工作区根目录")
    dest.parent.mkdir(parents=True, exist_ok=True)
    try:
        shutil.move(str(src), str(dest))
    except OSError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    return {
        "ok": True,
        "root": str(root),
        "path": dest_rel.replace("\\", "/"),
        "from": src_rel.replace("\\", "/"),
        "abs_path": str(dest),
        "type": "dir" if dest.is_dir() else "file",
    }


def path_info(root: Path, rel: str) -> dict:
    path = _safe_path(root, rel if (rel or "").strip() not in {"", "."} else ".")
    return {
        "ok": True,
        "root": str(root),
        "path": ("." if path.resolve() == root.resolve() else str(path.relative_to(root.resolve())).replace("\\", "/")),
        "abs_path": str(path),
        "type": "dir" if path.is_dir() else "file",
        "exists": path.exists(),
    }


def _resolve_git_dir(root: Path) -> Path | None:
    """Locate .git directory (supports worktree/gitfile)."""
    marker = root / ".git"
    try:
        if marker.is_dir():
            return marker
        if marker.is_file():
            # gitfile: "gitdir: <path>"
            text = marker.read_text(encoding="utf-8", errors="replace").strip()
            if text.lower().startswith("gitdir:"):
                target = text.split(":", 1)[1].strip()
                git_dir = Path(target)
                if not git_dir.is_absolute():
                    git_dir = (root / git_dir).resolve()
                if git_dir.is_dir():
                    return git_dir
    except OSError:
        return None
    return None


def git_info(root: Path) -> dict:
    """Return current branch for a workspace root (None when not a git repo).

    Prefer reading .git/HEAD directly so detection works even when `git` is
    missing from the server process PATH (common on Windows service starts).
    """
    root = Path(root)
    git_dir = _resolve_git_dir(root)
    if git_dir is None:
        return {"ok": True, "root": str(root), "is_repo": False, "branch": None}

    branch: str | None = None
    try:
        head = (git_dir / "HEAD").read_text(encoding="utf-8", errors="replace").strip()
    except OSError:
        head = ""
    if head.startswith("ref:"):
        ref = head.split(":", 1)[1].strip()
        # refs/heads/main → main
        if ref.startswith("refs/heads/"):
            branch = ref[len("refs/heads/") :]
        elif ref:
            branch = ref.rsplit("/", 1)[-1]
    elif head:
        # Detached HEAD — show short sha from the raw hash.
        branch = head[:7] if len(head) >= 7 else head

    if not branch:
        # Fallback: ask git binary if available.
        try:
            completed = subprocess.run(
                ["git", "rev-parse", "--abbrev-ref", "HEAD"],
                cwd=str(root),
                capture_output=True,
                text=True,
                timeout=8.0,
                encoding="utf-8",
                errors="replace",
            )
            if completed.returncode == 0:
                name = (completed.stdout or "").strip().splitlines()
                branch = (name[0] if name else "").strip() or None
        except (OSError, subprocess.TimeoutExpired):
            branch = None

    if not branch:
        return {"ok": True, "root": str(root), "is_repo": True, "branch": None}
    return {"ok": True, "root": str(root), "is_repo": True, "branch": branch}


def _decode_console_bytes(data: bytes | None) -> str:
    """Decode Windows cmd / shell output (often GBK) into Unicode text."""
    raw = data or b""
    if not raw:
        return ""
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        pass
    candidates: list[str] = []
    if sys.platform.startswith("win"):
        candidates.extend(["gbk", "cp936", "mbcs"])
    try:
        import locale

        pref = (locale.getpreferredencoding(False) or "").strip()
        if pref and pref.lower() not in {c.lower() for c in candidates}:
            candidates.append(pref)
    except Exception:
        pass
    for enc in candidates:
        try:
            return raw.decode(enc)
        except (LookupError, UnicodeDecodeError):
            continue
    return raw.decode("utf-8", errors="replace")


def _windows_cmd_exe() -> str:
    comspec = (os.environ.get("ComSpec") or "").strip()
    if comspec and comspec.lower().endswith("cmd.exe") and Path(comspec).is_file():
        return comspec
    windir = os.environ.get("SystemRoot") or os.environ.get("WINDIR") or r"C:\Windows"
    candidate = str(Path(windir) / "System32" / "cmd.exe")
    return candidate if Path(candidate).is_file() else "cmd.exe"


def _resolve_exec_cwd(root: Path, cwd: str | None) -> Path:
    """Resolve an optional cwd under (or equal to) the workspace root."""
    base = root.resolve()
    raw = (cwd or "").strip()
    if not raw or raw in {".", "./", ".\\"}:
        return base
    try:
        candidate = Path(raw)
        if not candidate.is_absolute():
            candidate = (base / candidate).resolve()
        else:
            candidate = candidate.resolve()
    except OSError as err:
        raise HTTPException(status_code=400, detail=f"无效工作目录: {err}") from err
    try:
        candidate.relative_to(base)
    except ValueError as err:
        raise HTTPException(status_code=400, detail="工作目录超出工作区") from err
    if not candidate.exists() or not candidate.is_dir():
        raise HTTPException(status_code=400, detail="工作目录不存在")
    return candidate


_CONDA_ENV_RE = re.compile(r"^[\w.\-]+$")


def sanitize_conda_env(name: str | None) -> str:
    env = (name or "").strip()
    if not env or env in {".", ".."} or not _CONDA_ENV_RE.match(env):
        return ""
    return env


def wrap_command_with_conda(command: str, conda_env: str | None, *, windows: bool) -> str:
    """Prefix a one-shot shell line so conda activate persists for this command only."""
    env = sanitize_conda_env(conda_env)
    cmd = (command or "").strip()
    if not env or not cmd:
        return cmd
    if windows:
        # call is required so activate.bat can mutate this cmd.exe /c session.
        return (
            f'call conda.bat activate {env} >nul 2>&1 '
            f'|| call conda activate {env} >nul 2>&1 '
            f'|| call activate {env} >nul 2>&1 '
            f'& {cmd}'
        )
    return (
        'if command -v conda >/dev/null 2>&1; then '
        'eval "$(conda shell.bash hook 2>/dev/null)" || '
        'true; '
        f'conda activate {env} 2>/dev/null || true; '
        "fi; "
        f"{{ {cmd}; }}"
    )


def run_command(
    root: Path,
    command: str,
    *,
    cwd: str | None = None,
    timeout: float = 30.0,
    conda_env: str | None = None,
) -> dict:
    """Run one line through the real system shell: Windows → cmd.exe, else /bin/sh."""
    cmd = (command or "").strip()
    if not cmd:
        raise HTTPException(status_code=422, detail="command required")
    if len(cmd) > 4000:
        raise HTTPException(status_code=400, detail="命令过长")
    work = _resolve_exec_cwd(root, cwd)
    env = os.environ.copy()
    env.setdefault("FORCE_COLOR", "1")
    env.setdefault("CLICOLOR_FORCE", "1")
    env.setdefault("TERM", "xterm-256color")
    windows = sys.platform.startswith("win")
    active_conda = sanitize_conda_env(conda_env)
    launch = wrap_command_with_conda(cmd, active_conda, windows=windows)
    # Never inherit a PowerShell-as-COMSPEC surprise: call cmd.exe explicitly on Windows.
    if windows:
        argv = [_windows_cmd_exe(), "/d", "/s", "/c", launch]
        shell_name = "cmd"
    else:
        argv = ["/bin/sh", "-c", launch]
        shell_name = "sh"
    try:
        completed = subprocess.run(
            argv,
            shell=False,
            cwd=str(work),
            capture_output=True,
            text=False,
            timeout=max(1.0, min(timeout, 120.0)),
            env=env,
        )
    except subprocess.TimeoutExpired as err:
        raise HTTPException(status_code=400, detail="命令超时") from err
    except OSError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    out = _decode_console_bytes(completed.stdout)
    err = _decode_console_bytes(completed.stderr)
    text = out + (("\n" + err) if err else "")
    if len(text) > 200_000:
        text = text[:200_000] + "\n…(truncated)"
    return {
        "ok": True,
        "root": str(root),
        "cwd": str(work),
        "command": cmd,
        "shell": shell_name,
        "conda_env": active_conda or None,
        "os_family": "windows" if windows else "unix",
        "os_label": (
            "Windows" if windows
            else ("macOS" if sys.platform == "darwin" else "Linux")
        ),
        "exit_code": completed.returncode,
        "output": text,
    }


def reveal_in_os(root: Path, rel: str) -> dict:
    info = path_info(root, rel)
    path = Path(info["abs_path"])
    if not path.exists():
        raise HTTPException(status_code=404, detail="路径不存在")
    try:
        if sys.platform.startswith("win"):
            if path.is_dir():
                subprocess.Popen(["explorer", str(path)], shell=False)
            else:
                subprocess.Popen(["explorer", f"/select,{path}"], shell=False)
        elif sys.platform == "darwin":
            if path.is_dir():
                subprocess.Popen(["open", str(path)])
            else:
                subprocess.Popen(["open", "-R", str(path)])
        else:
            target = path if path.is_dir() else path.parent
            subprocess.Popen(["xdg-open", str(target)])
    except OSError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    return info


def recent_workspace_suggestions(settings: dict, conversation_roots: list[str]) -> list[dict]:
    from backend.ssh_workspace import is_ssh_uri, normalize_ssh_workspace, parse_ssh_uri
    from backend.ssh_hosts import get_host

    seen: set[str] = set()
    out: list[dict] = []
    home = home_workspace()
    candidates = [
        str(home),
        str(Path(settings["host_root"]).resolve()),
        *conversation_roots,
    ]
    # Sibling projects under D:\code if present
    code_dir = Path("D:/code")
    if code_dir.is_dir():
        try:
            for child in sorted(code_dir.iterdir()):
                if child.is_dir() and child.name not in {".git"}:
                    candidates.append(str(child.resolve()))
        except OSError:
            pass
    for raw in candidates:
        text = str(raw or "").strip()
        if not text:
            continue
        if is_ssh_uri(text):
            try:
                uri = normalize_ssh_workspace(text)
                host_id, path = parse_ssh_uri(uri)
                host = get_host(host_id, include_secrets=False)
                host_label = host.get("label") or host_id
            except Exception:
                continue
            key = uri.lower()
            if key in seen:
                continue
            seen.add(key)
            out.append({
                "path": uri,
                "name": workspace_label(uri),
                "is_home": False,
                "is_ssh": True,
                "host_id": host_id,
                "host_label": host_label,
                "remote_path": path,
            })
            if len(out) >= 24:
                break
            continue
        try:
            p = Path(text).resolve()
        except OSError:
            continue
        key = str(p).lower()
        if key in seen or not p.is_dir():
            continue
        seen.add(key)
        out.append({
            "path": str(p),
            "name": workspace_label(p),
            "is_home": is_home_workspace(p),
            "is_ssh": False,
        })
        if len(out) >= 24:
            break
    # Home first, then SSH, then local
    out.sort(
        key=lambda x: (
            0 if x.get("is_home") else 1,
            0 if x.get("is_ssh") else 1,
            x.get("name", "").lower(),
        )
    )
    return out


def local_folder_suggestions(settings: dict, query: str = "", *, limit: int = 40) -> list[dict]:
    """On This PC path list (siblings under D:\\code + home + project)."""
    q = (query or "").strip().lower()
    seen: set[str] = set()
    out: list[dict] = []
    candidates: list[Path] = [
        home_workspace(),
        Path(settings["host_root"]).resolve(),
    ]
    code_dir = Path("D:/code")
    if code_dir.is_dir():
        try:
            for child in sorted(code_dir.iterdir()):
                if child.is_dir() and child.name not in {".git"}:
                    candidates.append(child.resolve())
        except OSError:
            pass
    for p in candidates:
        try:
            if not p.is_dir():
                continue
            path = str(p.resolve())
        except OSError:
            continue
        key = path.lower()
        if key in seen:
            continue
        if q and q not in key and q not in p.name.lower():
            continue
        seen.add(key)
        out.append({
            "path": path,
            "name": workspace_label(p),
            "is_home": is_home_workspace(p),
        })
        if len(out) >= limit:
            break
    return out
