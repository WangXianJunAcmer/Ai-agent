"""Interactive PTY sessions for the IDE terminal (local ConPTY/pty + SSH shell)."""

from __future__ import annotations

import os
import queue
import sys
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

from fastapi import HTTPException

from backend.workspace import _resolve_exec_cwd


@dataclass
class PtySession:
    shell_id: str
    user_id: int
    kind: str  # local | ssh
    write: Callable[[bytes], None]
    resize: Callable[[int, int], None]
    close: Callable[[], None]
    is_alive: Callable[[], bool]
    out_q: queue.Queue = field(default_factory=queue.Queue)
    _closed: bool = False

    def push_exit(self, code: int = 0) -> None:
        try:
            self.out_q.put_nowait(("exit", int(code)))
        except Exception:
            pass

    def push_bytes(self, data: bytes) -> None:
        if not data:
            return
        try:
            self.out_q.put_nowait(("data", data))
        except Exception:
            pass


_SESSIONS: dict[str, PtySession] = {}
_SESSIONS_LOCK = threading.Lock()


def _session_key(user_id: int, shell_id: str) -> str:
    return f"{int(user_id)}:{shell_id}"


def get_session(user_id: int, shell_id: str) -> PtySession | None:
    with _SESSIONS_LOCK:
        return _SESSIONS.get(_session_key(user_id, shell_id))


def drop_session(user_id: int, shell_id: str) -> None:
    key = _session_key(user_id, shell_id)
    with _SESSIONS_LOCK:
        sess = _SESSIONS.pop(key, None)
    if sess and not sess._closed:
        sess._closed = True
        try:
            sess.close()
        except Exception:
            pass


def _windows_powershell_exe() -> str:
    """Prefer pwsh (PowerShell 7+), then Windows PowerShell 5.x."""
    for name in ("pwsh.exe", "pwsh"):
        try:
            import shutil

            found = shutil.which(name)
            if found:
                return found
        except Exception:
            pass
    windir = os.environ.get("SystemRoot") or os.environ.get("WINDIR") or r"C:\Windows"
    candidate = Path(windir) / "System32" / "WindowsPowerShell" / "v1.0" / "powershell.exe"
    if candidate.is_file():
        return str(candidate)
    try:
        import shutil

        found = shutil.which("powershell.exe") or shutil.which("powershell")
        if found:
            return found
    except Exception:
        pass
    return "powershell.exe"


def _spawn_local_winpty(cwd: Path, cols: int, rows: int) -> tuple[Any, Callable[[], None], dict]:
    """Spawn PowerShell under ConPTY via winpty.PTY (non-blocking read).

    Returns (pty, closer, hooks) where hooks has write/resize/is_alive/read_chunk.
    """
    try:
        from winpty import PTY
    except ImportError as err:
        raise HTTPException(
            status_code=500,
            detail="缺少 pywinpty，请 pip install pywinpty",
        ) from err

    ps = _windows_powershell_exe()
    cols = max(20, int(cols))
    rows = max(5, int(rows))
    # Ensure TERM for child; winpty spawn env= wants a Windows env block string, so
    # we inherit the process environment instead of passing a dict.
    os.environ.setdefault("TERM", "xterm-256color")
    os.environ.setdefault("COLORTERM", "truecolor")
    # PTY(cols, rows)
    pty = PTY(cols, rows)
    # Single command-line form is the reliable ConPTY spawn on pywinpty 3.x.
    cmdline = f'"{ps}" -NoLogo -NoProfile' if (" " in ps) else f"{ps} -NoLogo -NoProfile"
    pty.spawn(cmdline, cwd=str(cwd))

    def _close() -> None:
        try:
            if pty.isalive():
                # Best-effort: send exit then cancel I/O.
                try:
                    pty.write("exit\r\n")
                except Exception:
                    pass
                time.sleep(0.05)
        except Exception:
            pass
        try:
            pty.cancel_io()
        except Exception:
            pass

    def _write_str(text: str) -> None:
        pty.write(text)

    def _resize(c: int, r: int) -> None:
        pty.set_size(max(20, c), max(5, r))

    def _is_alive() -> bool:
        try:
            return bool(pty.isalive())
        except Exception:
            return False

    def _read_chunk() -> bytes:
        # Non-blocking: empty str when nothing ready.
        try:
            chunk = pty.read(blocking=False)
        except TypeError:
            chunk = pty.read()
        if not chunk:
            return b""
        if isinstance(chunk, bytes):
            return chunk
        return str(chunk).encode("utf-8", errors="replace")

    def _exit_code() -> int:
        try:
            return int(pty.get_exitstatus() or 0)
        except Exception:
            return 0

    hooks = {
        "write_str": _write_str,
        "resize": _resize,
        "is_alive": _is_alive,
        "read_chunk": _read_chunk,
        "exit_code": _exit_code,
        "windows": True,
    }
    return pty, _close, hooks


def _spawn_local_ptyprocess(cwd: Path, cols: int, rows: int) -> tuple[Any, Callable[[], None], dict]:
    try:
        from ptyprocess import PtyProcess
    except ImportError as err:
        raise HTTPException(
            status_code=500,
            detail="缺少 ptyprocess，请 pip install ptyprocess",
        ) from err

    shell = (os.environ.get("SHELL") or "/bin/bash").strip()
    if not Path(shell).is_file():
        shell = "/bin/sh"
    # ptyprocess dimensions: (rows, cols)
    proc = PtyProcess.spawn(
        [shell, "-l"] if Path(shell).name in {"bash", "zsh"} else [shell],
        cwd=str(cwd),
        dimensions=(max(5, rows), max(20, cols)),
        env=_term_env(),
    )

    def _close() -> None:
        try:
            if proc.isalive():
                proc.terminate(force=True)
        except Exception:
            pass
        try:
            proc.close(force=True)
        except Exception:
            pass

    def _write_str(text: str) -> None:
        proc.write(text.encode("utf-8", errors="replace"))

    def _resize(c: int, r: int) -> None:
        proc.setwinsize(max(5, r), max(20, c))

    def _is_alive() -> bool:
        try:
            return bool(proc.isalive())
        except Exception:
            return False

    def _read_chunk() -> bytes:
        # Blocking read in dedicated thread is OK on Unix PTY.
        try:
            chunk = proc.read(4096)
        except EOFError:
            return b""
        if not chunk:
            return b""
        if isinstance(chunk, str):
            return chunk.encode("utf-8", errors="replace")
        return bytes(chunk)

    def _exit_code() -> int:
        try:
            return int(getattr(proc, "exitstatus", None) or 0)
        except Exception:
            return 0

    hooks = {
        "write_str": _write_str,
        "resize": _resize,
        "is_alive": _is_alive,
        "read_chunk": _read_chunk,
        "exit_code": _exit_code,
        "windows": False,
    }
    return proc, _close, hooks


def _term_env() -> dict[str, str]:
    env = os.environ.copy()
    env.setdefault("TERM", "xterm-256color")
    env.setdefault("COLORTERM", "truecolor")
    env.setdefault("FORCE_COLOR", "1")
    return env


def open_local_session(
    *,
    user_id: int,
    root: Path,
    cwd: str | None,
    cols: int = 80,
    rows: int = 24,
    shell_id: str | None = None,
) -> PtySession:
    uid = int(user_id)
    sid = (shell_id or "").strip() or uuid.uuid4().hex
    work = _resolve_exec_cwd(root, cwd)
    cols = max(20, min(int(cols or 80), 500))
    rows = max(5, min(int(rows or 24), 200))

    if sys.platform.startswith("win"):
        _proc, closer, hooks = _spawn_local_winpty(work, cols, rows)
    else:
        _proc, closer, hooks = _spawn_local_ptyprocess(work, cols, rows)

    out_q: queue.Queue = queue.Queue(maxsize=256)
    stop = threading.Event()
    windows = bool(hooks.get("windows"))

    def _write(data: bytes) -> None:
        if stop.is_set():
            return
        try:
            text = data.decode("utf-8", errors="replace")
            hooks["write_str"](text)
        except Exception:
            stop.set()

    def _resize(c: int, r: int) -> None:
        c = max(20, min(int(c or 80), 500))
        r = max(5, min(int(r or 24), 200))
        try:
            hooks["resize"](c, r)
        except Exception:
            pass

    def _is_alive() -> bool:
        try:
            return bool(hooks["is_alive"]()) and not stop.is_set()
        except Exception:
            return False

    def _close() -> None:
        stop.set()
        closer()

    def _reader() -> None:
        try:
            while not stop.is_set():
                if not hooks["is_alive"]():
                    # Drain any remaining output then exit.
                    for _ in range(20):
                        try:
                            leftover = hooks["read_chunk"]()
                        except Exception:
                            break
                        if leftover:
                            try:
                                out_q.put(("data", leftover), timeout=0.2)
                            except queue.Full:
                                try:
                                    out_q.get_nowait()
                                except queue.Empty:
                                    pass
                                try:
                                    out_q.put_nowait(("data", leftover))
                                except queue.Full:
                                    break
                        else:
                            break
                    break
                try:
                    payload = hooks["read_chunk"]()
                except EOFError:
                    break
                except Exception:
                    break
                if not payload:
                    # Windows ConPTY: non-blocking empty → brief sleep.
                    time.sleep(0.012 if windows else 0.02)
                    continue
                try:
                    out_q.put(("data", payload), timeout=1.0)
                except queue.Full:
                    try:
                        out_q.get_nowait()
                    except queue.Empty:
                        pass
                    try:
                        out_q.put_nowait(("data", payload))
                    except queue.Full:
                        pass
        finally:
            code = 0
            try:
                code = int(hooks["exit_code"]() or 0)
            except Exception:
                code = 0
            try:
                out_q.put(("exit", code), timeout=0.5)
            except Exception:
                pass
            stop.set()

    threading.Thread(target=_reader, name=f"pty-local-{sid[:8]}", daemon=True).start()

    sess = PtySession(
        shell_id=sid,
        user_id=uid,
        kind="local",
        write=_write,
        resize=_resize,
        close=_close,
        is_alive=_is_alive,
        out_q=out_q,
    )
    key = _session_key(uid, sid)
    with _SESSIONS_LOCK:
        old = _SESSIONS.pop(key, None)
        if old and old is not sess:
            try:
                old.close()
            except Exception:
                pass
        _SESSIONS[key] = sess
    return sess


def open_ssh_session(
    *,
    user_id: int,
    host_id: str,
    remote_cwd: str,
    cols: int = 80,
    rows: int = 24,
    shell_id: str | None = None,
) -> PtySession:
    from backend.ssh_workspace import (
        _cmd_exe_quote,
        _posix_ssh_path_to_win,
        detect_remote_os,
        get_client,
    )

    uid = int(user_id)
    sid = (shell_id or "").strip() or uuid.uuid4().hex
    cols = max(20, min(int(cols or 80), 500))
    rows = max(5, min(int(rows or 24), 200))
    work = (remote_cwd or "/").strip() or "/"
    if not work.startswith("/") and not (len(work) >= 2 and work[1] == ":"):
        work = "/" + work

    client = get_client(host_id)
    remote_os = detect_remote_os(host_id)
    family = str(remote_os.get("family") or "unix")

    try:
        channel = client.invoke_shell(
            term="xterm-256color",
            width=cols,
            height=rows,
        )
    except Exception as err:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"SSH shell 启动失败: {err}") from err

    channel.settimeout(0.0)

    # Land in workspace cwd once the shell is up.
    try:
        if family == "windows":
            win = _posix_ssh_path_to_win(work)
            channel.send(f"cd /d {_cmd_exe_quote(win)}\r\n")
        else:
            channel.send(f"cd {_sh_quote(work)} || true\n")
            channel.send("export TERM=xterm-256color COLORTERM=truecolor\n")
    except Exception:
        pass

    out_q: queue.Queue = queue.Queue(maxsize=256)
    stop = threading.Event()

    def _write(data: bytes) -> None:
        if stop.is_set() or channel.closed:
            return
        try:
            channel.send(data)
        except Exception:
            stop.set()

    def _resize(c: int, r: int) -> None:
        c = max(20, min(int(c or 80), 500))
        r = max(5, min(int(r or 24), 200))
        try:
            channel.resize_pty(width=c, height=r)
        except Exception:
            pass

    def _is_alive() -> bool:
        try:
            return (not channel.closed) and not stop.is_set()
        except Exception:
            return False

    def _close() -> None:
        stop.set()
        try:
            channel.close()
        except Exception:
            pass

    def _reader() -> None:
        try:
            while not stop.is_set() and not channel.closed:
                data = b""
                try:
                    if channel.recv_ready():
                        data = channel.recv(8192) or b""
                    elif channel.recv_stderr_ready():
                        data = channel.recv_stderr(8192) or b""
                    elif channel.exit_status_ready():
                        break
                    else:
                        time.sleep(0.015)
                        continue
                except Exception:
                    break
                if data:
                    try:
                        out_q.put(("data", data), timeout=1.0)
                    except queue.Full:
                        try:
                            out_q.get_nowait()
                        except queue.Empty:
                            pass
                        try:
                            out_q.put_nowait(("data", data))
                        except queue.Full:
                            pass
        finally:
            code = 0
            try:
                if channel.exit_status_ready():
                    code = int(channel.recv_exit_status())
            except Exception:
                code = 0
            try:
                out_q.put(("exit", code), timeout=0.5)
            except Exception:
                pass
            stop.set()

    threading.Thread(target=_reader, name=f"pty-ssh-{sid[:8]}", daemon=True).start()

    sess = PtySession(
        shell_id=sid,
        user_id=uid,
        kind="ssh",
        write=_write,
        resize=_resize,
        close=_close,
        is_alive=_is_alive,
        out_q=out_q,
    )
    key = _session_key(uid, sid)
    with _SESSIONS_LOCK:
        old = _SESSIONS.pop(key, None)
        if old and old is not sess:
            try:
                old.close()
            except Exception:
                pass
        _SESSIONS[key] = sess
    return sess


def _sh_quote(arg: str) -> str:
    import shlex

    return shlex.quote(str(arg))
