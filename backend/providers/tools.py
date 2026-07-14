"""Local coding tools for OpenAI-compatible agents (OpenAI / DeepSeek).

# ponytail: plain callables + OpenAI tools JSON schema; no LangChain.
"""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path
from typing import Any, Callable

from backend.repo_write_guard import repo_write_block_reason
from backend.safety import sensitive_tool_block_reason

_MAX_READ = 200_000
_MAX_SHELL_OUT = 50_000
_SHELL_TIMEOUT = 60


def _resolve_in_root(host_root: Path, path: str) -> Path:
    raw = (path or "").strip() or "."
    candidate = (host_root / raw).resolve() if not Path(raw).is_absolute() else Path(raw).resolve()
    try:
        candidate.relative_to(host_root)
    except ValueError as err:
        raise ValueError(f"path escapes workspace: {path}") from err
    return candidate


def _safe_resolve(host_root: Path, path: str) -> Path | str:
    try:
        return _resolve_in_root(host_root, path)
    except ValueError as err:
        return str(err)


def make_tool_kit(
    settings: dict,
    *,
    allow_write: bool,
    tracker=None,
) -> tuple[list[dict], dict[str, Callable[..., str]]]:
    """Return (OpenAI tools schemas, name → executor)."""
    host_root = Path(settings["host_root"]).resolve()

    def _block(name: str, args: dict) -> str | None:
        return repo_write_block_reason(settings, name, args) or sensitive_tool_block_reason(
            name, args
        )

    def _track(path: str) -> None:
        if tracker is not None:
            tracker.mark_touched(path)

    def read_file(path: str) -> str:
        blocked = _block("read", {"path": path})
        if blocked:
            return blocked
        target = _safe_resolve(host_root, path)
        if isinstance(target, str):
            return target
        if not target.is_file():
            return f"not a file: {path}"
        data = target.read_bytes()
        suffix = ""
        if len(data) > _MAX_READ:
            data = data[:_MAX_READ]
            suffix = f"\n… truncated to {_MAX_READ} bytes"
        try:
            return data.decode("utf-8") + suffix
        except UnicodeDecodeError:
            return f"binary file ({len(data)} bytes); cannot decode as utf-8"

    def list_dir(path: str = ".") -> str:
        blocked = _block("ls", {"path": path})
        if blocked:
            return blocked
        target = _safe_resolve(host_root, path)
        if isinstance(target, str):
            return target
        if not target.is_dir():
            return f"not a directory: {path}"
        entries = sorted(target.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))
        lines = [f"{p.name}{'/' if p.is_dir() else ''}" for p in entries[:500]]
        if len(entries) > 500:
            lines.append(f"… ({len(entries) - 500} more)")
        return "\n".join(lines) or "(empty)"

    def glob_files(pattern: str) -> str:
        blocked = _block("glob", {"glob_pattern": pattern})
        if blocked:
            return blocked
        pat = (pattern or "").strip() or "*"
        matches = sorted(host_root.glob(pat))[:200]
        rels = []
        for p in matches:
            try:
                rels.append(str(p.relative_to(host_root)))
            except ValueError:
                continue
        return "\n".join(rels) or "(no matches)"

    def grep(pattern: str, path: str = ".", glob: str = "") -> str:
        blocked = _block("grep", {"pattern": pattern, "path": path, "glob_pattern": glob})
        if blocked:
            return blocked
        root = _safe_resolve(host_root, path)
        if isinstance(root, str):
            return root
        try:
            rx = re.compile(pattern)
        except re.error as err:
            return f"invalid regex: {err}"
        hits: list[str] = []
        files = [root] if root.is_file() else root.rglob(glob or "*")
        for fp in files:
            if not fp.is_file():
                continue
            try:
                text = fp.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue
            for i, line in enumerate(text.splitlines(), 1):
                if rx.search(line):
                    try:
                        rel = fp.relative_to(host_root)
                    except ValueError:
                        rel = fp
                    hits.append(f"{rel}:{i}:{line[:240]}")
                    if len(hits) >= 80:
                        hits.append("… truncated")
                        return "\n".join(hits)
        return "\n".join(hits) or "(no matches)"

    def write_file(path: str, content: str) -> str:
        if not allow_write:
            return "writes disabled (plan mode or allow_repo_write=false)"
        blocked = _block("write", {"path": path})
        if blocked:
            return blocked
        target = _safe_resolve(host_root, path)
        if isinstance(target, str):
            return target
        if tracker is not None:
            tracker.snapshot_before(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        _track(path)
        return f"wrote {len(content)} chars to {path}"

    def str_replace(path: str, old_string: str, new_string: str) -> str:
        if not allow_write:
            return "writes disabled (plan mode or allow_repo_write=false)"
        blocked = _block("strreplace", {"path": path})
        if blocked:
            return blocked
        target = _safe_resolve(host_root, path)
        if isinstance(target, str):
            return target
        if not target.is_file():
            return f"not a file: {path}"
        if tracker is not None:
            tracker.snapshot_before(path)
        text = target.read_text(encoding="utf-8")
        if old_string not in text:
            return "old_string not found"
        target.write_text(text.replace(old_string, new_string, 1), encoding="utf-8")
        _track(path)
        return f"updated {path}"

    def run_shell(command: str) -> str:
        blocked = _block("shell", {"command": command})
        if blocked:
            return blocked
        try:
            proc = subprocess.run(
                command,
                shell=True,
                cwd=str(host_root),
                capture_output=True,
                text=True,
                timeout=_SHELL_TIMEOUT,
            )
        except subprocess.TimeoutExpired:
            return f"timeout after {_SHELL_TIMEOUT}s"
        out = (proc.stdout or "") + (("\n" + proc.stderr) if proc.stderr else "")
        if len(out) > _MAX_SHELL_OUT:
            out = out[:_MAX_SHELL_OUT] + "\n… truncated"
        return f"exit={proc.returncode}\n{out}" if out else f"exit={proc.returncode}"

    executors: dict[str, Callable[..., str]] = {
        "read_file": read_file,
        "list_dir": list_dir,
        "glob_files": glob_files,
        "grep": grep,
        "run_shell": run_shell,
    }
    if allow_write:
        executors["write_file"] = write_file
        executors["str_replace"] = str_replace

    schemas = [_openai_schema(name, fn) for name, fn in executors.items()]
    return schemas, executors


_PARAM_HINTS: dict[str, dict[str, Any]] = {
    "read_file": {
        "properties": {"path": {"type": "string", "description": "Workspace-relative path"}},
        "required": ["path"],
    },
    "list_dir": {
        "properties": {"path": {"type": "string", "description": "Directory path", "default": "."}},
        "required": [],
    },
    "glob_files": {
        "properties": {"pattern": {"type": "string", "description": "Glob under workspace"}},
        "required": ["pattern"],
    },
    "grep": {
        "properties": {
            "pattern": {"type": "string"},
            "path": {"type": "string", "default": "."},
            "glob": {"type": "string", "description": "Optional filename glob", "default": ""},
        },
        "required": ["pattern"],
    },
    "write_file": {
        "properties": {
            "path": {"type": "string"},
            "content": {"type": "string"},
        },
        "required": ["path", "content"],
    },
    "str_replace": {
        "properties": {
            "path": {"type": "string"},
            "old_string": {"type": "string"},
            "new_string": {"type": "string"},
        },
        "required": ["path", "old_string", "new_string"],
    },
    "run_shell": {
        "properties": {"command": {"type": "string"}},
        "required": ["command"],
    },
}

_DESCRIPTIONS = {
    "read_file": "Read a UTF-8 text file relative to the workspace root.",
    "list_dir": "List files and directories under a workspace-relative path.",
    "glob_files": "Glob files under the workspace (e.g. 'backend/**/*.py').",
    "grep": "Search file contents with a regex. Optional glob filter (e.g. '*.py').",
    "write_file": "Create or overwrite a text file relative to the workspace root.",
    "str_replace": "Replace the first exact occurrence of old_string in a file.",
    "run_shell": "Run a shell command with cwd=workspace root.",
}


def _openai_schema(name: str, _fn: Callable) -> dict:
    hint = _PARAM_HINTS[name]
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": _DESCRIPTIONS[name],
            "parameters": {
                "type": "object",
                "properties": hint["properties"],
                "required": hint.get("required") or [],
            },
        },
    }


def run_tool(executors: dict[str, Callable[..., str]], name: str, arguments: str | dict) -> str:
    fn = executors.get(name)
    if not fn:
        return f"unknown tool: {name}"
    if isinstance(arguments, str):
        try:
            args = json.loads(arguments or "{}")
        except json.JSONDecodeError:
            return f"invalid tool arguments JSON: {arguments[:200]}"
    elif isinstance(arguments, dict):
        args = arguments
    else:
        args = {}
    if not isinstance(args, dict):
        return "tool arguments must be an object"
    try:
        return fn(**args)
    except TypeError as err:
        return f"bad arguments: {err}"
    except Exception as err:
        return f"tool error: {err}"


def demo() -> None:
    import tempfile

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "a.txt").write_text("hello", encoding="utf-8")
        settings = {"host_root": root, "allow_repo_write": True, "safety_enabled": False}
        schemas, ex = make_tool_kit(settings, allow_write=True)
        assert any(s["function"]["name"] == "read_file" for s in schemas)
        assert "hello" in run_tool(ex, "read_file", {"path": "a.txt"})
        assert "escapes" in run_tool(ex, "read_file", {"path": "../outside"}).lower()
        print("tools demo ok")


if __name__ == "__main__":
    demo()
