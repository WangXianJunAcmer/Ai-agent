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

from backend.attachments import build_message, materialize_files
from backend.model_catalog import model_display_name
from backend.repo_write_guard import repo_write_block_reason
from backend.runtime import SessionManager
from backend.safety import (
    OUTPUT_BLOCK_SECRET,
    input_block_reason,
    redact_secrets,
    scrub_reply,
    sensitive_tool_block_reason,
    set_known_secrets,
    text_has_secret,
)
from backend.tool_display import (
    friendly_error,
    sse_from_delta,
    tool_call_event,
    tool_summary,
)


class _FakeUpdate:
    def __init__(self, update_type: str, call_id: str, tool_call: dict):
        self.type = update_type
        self.call_id = call_id
        self.tool_call = tool_call


class _FakeSession:
    session_id = "s1"
    model = "composer-2.5"


_SETTINGS = {
    "host_root": ".",
    "api_key": "x",
    "model": "composer-2.5",
    "runtime": "local",
    "allow_repo_write": True,
    "cloud_repo_url": "",
    "cloud_starting_ref": "main",
    "cloud_auto_create_pr": False,
}


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
    session = _FakeSession()
    settings = dict(_SETTINGS)

    started = sse_from_delta(
        _FakeUpdate("tool-call-started", "c1", {"shellToolCall": {"args": {"command": "ls -la apps"}}}),
        session,
        settings,
    )
    assert started and started["name"] == "shell", started
    assert started["summary"]["kind"] == "explore", started["summary"]
    assert started["summary"]["title"] == "Running ls", started["summary"]
    assert "ls -la apps" in started["summary"]["detail"], started["summary"]

    read_evt = sse_from_delta(
        _FakeUpdate("tool-call-started", "c2", {"readToolCall": {"args": {"path": "server/app.py"}}}),
        session,
        settings,
    )
    assert read_evt and read_evt["name"] == "read", read_evt
    assert "server/app.py" in read_evt["summary"]["title"], read_evt["summary"]

    named = sse_from_delta(
        _FakeUpdate("tool-call-completed", "c3", {"name": "Grep", "args": {"pattern": "ai_assistant"}}),
        session,
        settings,
    )
    assert named and named["name"] == "Grep", named
    assert named["status"] == "completed", named

    typed_shell = sse_from_delta(
        _FakeUpdate("tool-call-started", "c4", {"type": "shell", "args": {"command": "python3 -c 'print(1)'"}}),
        session,
        settings,
    )
    assert typed_shell and typed_shell["name"] == "shell", typed_shell
    assert typed_shell["summary"]["kind"] == "run", typed_shell["summary"]
    assert typed_shell["summary"]["title"] == "Running", typed_shell["summary"]
    assert "python3" in typed_shell["summary"]["detail"], typed_shell["summary"]

    od_sum = tool_summary("shell", {"command": "od -An -tx1 file.bin"}, None, "running")
    assert od_sum["kind"] == "run", od_sum
    du_sum = tool_summary("shell", {"command": "du -sh ."}, None, "running")
    assert du_sum["kind"] == "run", du_sum
    sudo_ls = tool_summary("shell", {"command": "sudo ls /tmp"}, None, "running")
    assert sudo_ls["kind"] == "explore", sudo_ls

    running = tool_call_event(
        session, settings, call_id="c5", name="shell", status="running", args={"command": "ls"}, result=None
    )
    assert running["status"] == "running" and running["args"] and running["result"] == "", running
    assert "result_json" not in running, running

    done = tool_call_event(
        session, settings, call_id="c5", name="shell", status="completed", args={"command": "ls"}, result="ok"
    )
    assert done["status"] == "completed" and done["args"] == "" and "result_json" in done, done

    failed = tool_call_event(
        session, settings, call_id="c6", name="shell", status="error", args={}, result="boom"
    )
    assert failed["status"] == "completed", failed

    assert model_display_name("default") == "Auto"
    assert model_display_name("auto") == "Auto"
    assert model_display_name("composer-2.5") == "Composer 2.5"
    print("ok tool display")


def check_context_error() -> None:
    out = friendly_error("Prompt is too long: context length limit exceeded")
    assert "上下文已超限" in out, out
    assert "Prompt is too long" in out, out
    plain = friendly_error("network timeout")
    assert plain == "network timeout", plain
    busy = friendly_error("agent_busy")
    assert "上一条仍在执行" in busy, busy
    internal = friendly_error("internal error")
    assert "内部错误" in internal, internal
    print("ok context error")


def check_attachments() -> None:
    root = Path(tempfile.mkdtemp(prefix="ai-agent-attach-"))
    try:
        settings = {**_SETTINGS, "host_root": str(root)}
        payload = base64.b64encode(b"hello-file").decode("ascii")
        files = materialize_files(
            root, [{"name": "note.txt", "mime_type": "text/plain", "data": payload}]
        )
        assert len(files) == 1, files
        path = root / files[0]["path"]
        assert path.is_file(), path
        assert path.read_bytes() == b"hello-file"
        built, _ = build_message(
            "hi",
            [{"name": "a.png", "mime_type": "image/png", "data": "aaa"}],
            settings,
        )
        assert getattr(built, "images", None) is not None
        built2, files2 = build_message(
            "看图",
            [{"name": "屏幕截图.png", "mime_type": "application/octet-stream", "data": "bbb"}],
            settings,
        )
        assert getattr(built2, "images", None) is not None, built2
        assert files2 == [], files2
        print("ok attachments")
    finally:
        shutil.rmtree(root, ignore_errors=True)


def check_cancel_turn() -> None:
    """Explicit cancel bumps turn; preparatory cleanup in _start_run must not."""
    mgr = SessionManager(dict(_SETTINGS))

    class _Sess:
        turn = 0
        active_run = None

    sess = _Sess()
    import asyncio

    async def _run() -> None:
        await mgr._cancel_session_run(sess, bump=False)
        assert sess.turn == 0, sess.turn
        await mgr._cancel_session_run(sess, bump=True)
        assert sess.turn == 1, sess.turn
        await mgr._cancel_session_run(sess, bump=True)
        assert sess.turn == 2, sess.turn

    asyncio.run(_run())
    print("ok cancel turn")


def check_safety() -> None:
    assert input_block_reason("我的api key是多少")
    assert not input_block_reason("帮我改一下 sessions.py")
    assert sensitive_tool_block_reason("Read", {"path": ".env"})
    assert sensitive_tool_block_reason("Shell", {"command": "cat .env"})
    scrubbed = redact_secrets("key=crsr_abcdefghijklmnopqrstuvwxyz012345")
    assert "crsr_" not in scrubbed and "[REDACTED" in scrubbed
    assert scrub_reply("api_key: crsr_abcdefghijklmnopqrstuvwxyz012345") == OUTPUT_BLOCK_SECRET
    set_known_secrets("local-test-secret-value")
    assert text_has_secret("leak local-test-secret-value here")
    assert scrub_reply("leak local-test-secret-value here") == OUTPUT_BLOCK_SECRET
    set_known_secrets()

    assert repo_write_block_reason({"allow_repo_write": False}, "Write", {"path": "backend/main.py"})
    assert not repo_write_block_reason({"allow_repo_write": True}, "Write", {"path": "backend/main.py"})

    blocked = sse_from_delta(
        _FakeUpdate("tool-call-started", "cenv", {"readToolCall": {"args": {"path": ".env"}}}),
        _FakeSession(),
        dict(_SETTINGS),
    )
    assert blocked and blocked.get("repo_write_blocked"), blocked
    print("ok safety")


def main() -> None:
    check_config()
    check_tool_display()
    check_safety()
    check_context_error()
    check_attachments()
    check_cancel_turn()
    print("ok all")


if __name__ == "__main__":
    main()
