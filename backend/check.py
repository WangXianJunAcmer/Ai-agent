"""One runnable self-check for Ai-agent (config + tool display + attachments + errors)."""

from __future__ import annotations

import base64
import shutil
import sys
import tempfile
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.model_catalog import model_display_name
from backend.sessions import SessionManager


class _FakeUpdate:
    def __init__(self, update_type: str, call_id: str, tool_call: dict):
        self.type = update_type
        self.call_id = call_id
        self.tool_call = tool_call


class _FakeSession:
    session_id = "s1"
    model = "composer-2.5"


def check_config() -> None:
    cfg_path = ROOT / "config.yaml"
    assert cfg_path.is_file(), "missing config.yaml"
    with open(cfg_path, encoding="utf-8") as f:
        cfg = yaml.safe_load(f) or {}
    host_root = (ROOT / cfg.get("host_project_root", "..")).resolve()
    assert host_root.is_dir(), f"host_project_root does not exist: {host_root}"
    assert (ROOT / "frontend" / "widget.js").is_file(), "missing frontend/widget.js"
    print(f"ok config host_root={host_root}")


def check_tool_display() -> None:
    mgr = SessionManager(
        {
            "host_root": ".",
            "api_key": "x",
            "model": "composer-2.5",
            "runtime": "local",
            "cloud_repo_url": "",
            "cloud_starting_ref": "main",
            "cloud_auto_create_pr": False,
        }
    )
    session = _FakeSession()

    started = mgr._sse_from_delta(
        _FakeUpdate("tool-call-started", "c1", {"shellToolCall": {"args": {"command": "ls -la apps"}}}),
        session,
    )
    assert started and started["name"] == "shell", started
    assert "ls -la apps" in started["summary"]["title"], started["summary"]

    read_evt = mgr._sse_from_delta(
        _FakeUpdate("tool-call-started", "c2", {"readToolCall": {"args": {"path": "server/app.py"}}}),
        session,
    )
    assert read_evt and read_evt["name"] == "read", read_evt
    assert "server/app.py" in read_evt["summary"]["title"], read_evt["summary"]

    named = mgr._sse_from_delta(
        _FakeUpdate("tool-call-completed", "c3", {"name": "Grep", "args": {"pattern": "ai_assistant"}}),
        session,
    )
    assert named and named["name"] == "Grep", named
    assert named["status"] == "completed", named

    typed_shell = mgr._sse_from_delta(
        _FakeUpdate("tool-call-started", "c4", {"type": "shell", "args": {"command": "python3 -c 'print(1)'"}}),
        session,
    )
    assert typed_shell and typed_shell["name"] == "shell", typed_shell
    assert "python3" in typed_shell["summary"]["title"], typed_shell["summary"]

    running = mgr._tool_call_event(
        session, call_id="c5", name="shell", status="running", args={"command": "ls"}, result=None
    )
    assert running["status"] == "running" and running["args"] and running["result"] == "", running
    assert "result_json" not in running, running

    done = mgr._tool_call_event(
        session, call_id="c5", name="shell", status="completed", args={"command": "ls"}, result="ok"
    )
    assert done["status"] == "completed" and done["args"] == "" and "result_json" in done, done

    failed = mgr._tool_call_event(
        session, call_id="c6", name="shell", status="error", args={}, result="boom"
    )
    assert failed["status"] == "completed", failed

    assert model_display_name("default") == "Auto"
    assert model_display_name("auto") == "Auto"
    assert model_display_name("composer-2.5") == "Composer 2.5"
    print("ok tool display")


def check_context_error() -> None:
    mgr = SessionManager(
        {"host_root": ".", "api_key": "x", "model": "composer-2.5", "runtime": "local"}
    )
    out = mgr._friendly_error("Prompt is too long: context length limit exceeded")
    assert "上下文已超限" in out, out
    assert "Prompt is too long" in out, out
    plain = mgr._friendly_error("network timeout")
    assert plain == "network timeout", plain
    print("ok context error")


def check_attachments() -> None:
    root = Path(tempfile.mkdtemp(prefix="ai-agent-attach-"))
    try:
        mgr = SessionManager(
            {
                "host_root": str(root),
                "api_key": "x",
                "model": "composer-2.5",
                "runtime": "local",
            }
        )
        payload = base64.b64encode(b"hello-file").decode("ascii")
        files = mgr._materialize_files(
            [{"name": "note.txt", "mime_type": "text/plain", "data": payload}]
        )
        assert len(files) == 1, files
        path = root / files[0]["path"]
        assert path.is_file(), path
        assert path.read_bytes() == b"hello-file"
        built, _ = mgr._build_message(
            "hi",
            [{"name": "a.png", "mime_type": "image/png", "data": "aaa"}],
        )
        assert getattr(built, "images", None) is not None
        print("ok attachments")
    finally:
        shutil.rmtree(root, ignore_errors=True)


def main() -> None:
    check_config()
    check_tool_display()
    check_context_error()
    check_attachments()
    print("ok all")


if __name__ == "__main__":
    main()
