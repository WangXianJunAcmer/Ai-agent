"""One runnable self-check for Coding Agent (config + tool display + attachments + errors)."""

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

from backend.attachments import (
    MAX_ATTACHMENT_BYTES,
    build_message,
    decode_attachment_bytes,
    materialize_files,
    prune_upload_dir,
)
from backend.model_catalog import model_display_name
from backend.repo_write_guard import repo_write_block_reason
from backend.runtime import SessionManager
from backend.safety import (
    OUTPUT_BLOCK_SECRET,
    input_block_reason,
    redact_secrets,
    sanitize_event,
    scrub_reply,
    sensitive_tool_block_reason,
    set_known_secrets,
    set_safety_enabled,
    text_has_secret,
)
from backend.tool_display import (
    friendly_error,
    sse_from_delta,
    tool_call_event,
    tool_summary,
    assistant_text_from_message,
    dedupe_cumulative,
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
    "safety_enabled": True,
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
    from backend.main import _JS_PARTS, build_widget_js
    from backend.providers import IMPLEMENTED, RESERVED, normalize_provider, require_implemented

    js_dir = ROOT / "frontend" / "js"
    for name in _JS_PARTS:
        assert (js_dir / name).is_file(), f"missing frontend/js/{name}"
    bundle = build_widget_js()
    assert "(function ()" in bundle[:500], "widget bundle missing IIFE open"
    assert bundle.rstrip().endswith("})();"), "widget bundle missing IIFE close"
    assert "function renderMarkdown" in bundle, "widget bundle missing renderMarkdown"
    assert "function safeMarkdownHref" in bundle, "widget bundle missing safeMarkdownHref"
    # Agent writes under cwd; reload parent watcher would kill mid-turn SSE.
    assert not bool((cfg.get("server") or {}).get("reload", False)), "server.reload must be false"
    provider = normalize_provider((cfg.get("agent") or {}).get("provider"))
    require_implemented(provider)
    assert provider in IMPLEMENTED
    assert "openai" in RESERVED and "deepseek" in RESERVED
    print(f"ok config host_root={host_root} provider={provider}")


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
    assert started["summary"]["title"] == "Running", started["summary"]
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

    class _Sum:
        type = "summary"
        summary = "next: read auth"

    plan = sse_from_delta(_Sum(), session, settings)
    assert plan and plan["type"] == "summary" and "read auth" in (plan.get("summary") or plan.get("content") or ""), plan

    class _SumDone:
        type = "summary-completed"

    plan_done = sse_from_delta(_SumDone(), session, settings)
    assert plan_done and plan_done.get("completed") is True, plan_done

    class _ThinkDone:
        type = "thinking-completed"
        thinking_duration_ms = 1200

    done_think = sse_from_delta(_ThinkDone(), session, settings)
    assert done_think and done_think.get("completed") is True, done_think

    # Probe-corrected: GPT also gets real thinking-completed (not dropped).
    gpt_session = _FakeSession()
    gpt_session.model = "gpt-5.2"
    gpt_done = sse_from_delta(_ThinkDone(), gpt_session, settings)
    assert gpt_done and gpt_done.get("completed") is True, gpt_done

    class _Block:
        type = "text"
        text = "hello"

    class _AssistContent:
        content = (_Block(),)

    class _Assist:
        message = _AssistContent()

    assert assistant_text_from_message(_Assist()) == "hello"
    assert dedupe_cumulative("hel", "hello") == ("hello", "lo")
    assert dedupe_cumulative("hello", "hello") == ("hello", "")

    od_sum = tool_summary("shell", {"command": "od -An -tx1 file.bin"}, None, "running")
    assert od_sum["kind"] == "run", od_sum
    du_sum = tool_summary("shell", {"command": "du -sh ."}, None, "running")
    assert du_sum["kind"] == "run", du_sum
    sudo_ls = tool_summary("shell", {"command": "sudo ls /tmp"}, None, "running")
    assert sudo_ls["kind"] == "explore", sudo_ls
    lint_sum = tool_summary("ReadLints", {"paths": ["/tmp/a.py"]}, None, "running")
    assert lint_sum["title"] == "Read lints" and lint_sum["detail"] == "" and lint_sum["paths"] == ["/tmp/a.py"], lint_sum

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

    with tempfile.TemporaryDirectory() as tmp:
        doomed = Path(tmp) / "doomed.py"
        doomed.write_text("a\nb\nc\n", encoding="utf-8")
        del_settings = dict(settings, host_root=tmp)
        del_run = tool_call_event(
            session,
            del_settings,
            call_id="c7",
            name="Delete",
            status="running",
            args={"path": "doomed.py"},
            result=None,
        )
        assert del_run["summary"].get("status") == "deleted", del_run["summary"]
        assert del_run["summary"].get("deletions") == 3, del_run["summary"]
        assert del_run["summary"].get("diff"), del_run["summary"]
        doomed.unlink()
        del_done = tool_call_event(
            session,
            del_settings,
            call_id="c7",
            name="Delete",
            status="completed",
            args={"path": "doomed.py"},
            result="ok",
        )
        assert del_done["summary"].get("deletions") == 3, del_done["summary"]

        # Write overwrite: completed must use running snapshot, not post-write disk.
        target = Path(tmp) / "rb.py"
        target.write_text("a\nb\n", encoding="utf-8")
        write_run = tool_call_event(
            session,
            del_settings,
            call_id="c8",
            name="Write",
            status="running",
            args={"path": "rb.py", "contents": "a\nb\nc\nd\n"},
            result=None,
        )
        target.write_text("a\nb\nc\nd\n", encoding="utf-8")
        write_done = tool_call_event(
            session,
            del_settings,
            call_id="c8",
            name="Write",
            status="completed",
            args={"path": "rb.py"},
            result="ok",
        )
        assert write_done["summary"].get("additions") == 2, write_done["summary"]
        assert write_done["summary"].get("deletions") == 0, write_done["summary"]
        assert write_done["summary"].get("status") == "modified", write_done["summary"]

        # StrReplace completed with empty args still counts via snapshot.
        sr_run = tool_call_event(
            session,
            del_settings,
            call_id="c9",
            name="StrReplace",
            status="running",
            args={"path": "rb.py", "old_string": "c\nd\n", "new_string": "c\n"},
            result=None,
        )
        target.write_text("a\nb\nc\n", encoding="utf-8")
        sr_done = tool_call_event(
            session,
            del_settings,
            call_id="c9",
            name="StrReplace",
            status="completed",
            args={"path": "rb.py"},
            result="ok",
        )
        assert sr_done["summary"].get("additions") == 0, sr_done["summary"]
        assert sr_done["summary"].get("deletions") == 1, sr_done["summary"]

        # New file: late running/partial after write must not poison before → +0.
        fresh = Path(tmp) / "new_rb.py"
        assert not fresh.exists()
        new_run = tool_call_event(
            session,
            del_settings,
            call_id="c10",
            name="Write",
            status="running",
            args={"path": "new_rb.py", "contents": "x\ny\nz\n"},
            result=None,
        )
        assert new_run["summary"].get("status") == "created", new_run["summary"]
        assert new_run["summary"].get("additions") == 3, new_run["summary"]
        fresh.write_text("x\ny\nz\n", encoding="utf-8")
        # Simulate Cursor partial/running after the write landed.
        late_run = tool_call_event(
            session,
            del_settings,
            call_id="c10",
            name="Write",
            status="running",
            args={"path": "new_rb.py", "contents": "x\ny\nz\n"},
            result=None,
        )
        assert late_run["summary"].get("status") == "created", late_run["summary"]
        assert late_run["summary"].get("additions") == 3, late_run["summary"]
        new_done = tool_call_event(
            session,
            del_settings,
            call_id="c10",
            name="Write",
            status="completed",
            args={"path": "new_rb.py"},
            result="ok",
        )
        assert new_done["summary"].get("status") == "created", new_done["summary"]
        assert new_done["summary"].get("additions") == 3, new_done["summary"]
        assert new_done["summary"].get("deletions") == 0, new_done["summary"]

        # Flat Write payload must keep contents (not drop it when extracting args).
        from backend.tool_display import tool_args_from_payload

        flat = tool_args_from_payload({"path": "a.py", "contents": "one\ntwo\n"})
        assert flat.get("contents") == "one\ntwo\n", flat

        # Cursor SDK Write uses fileText + result.linesCreated (count at edit time).
        cursor_run = tool_call_event(
            session,
            del_settings,
            call_id="c11",
            name="writeToolCall",
            status="running",
            args={"path": "sdk_new.cpp", "fileText": "a\nb\nc\nd\n"},
            result=None,
        )
        assert cursor_run["summary"].get("status") == "created", cursor_run["summary"]
        assert cursor_run["summary"].get("additions") == 4, cursor_run["summary"]
        (Path(tmp) / "sdk_new.cpp").write_text("a\nb\nc\nd\n", encoding="utf-8")
        cursor_done = tool_call_event(
            session,
            del_settings,
            call_id="c11",
            name="writeToolCall",
            status="completed",
            args={"path": "sdk_new.cpp"},
            result={"status": "success", "value": {"path": "sdk_new.cpp", "linesCreated": 4, "fileSize": 8}},
        )
        assert cursor_done["summary"].get("status") == "created", cursor_done["summary"]
        assert cursor_done["summary"].get("additions") == 4, cursor_done["summary"]
        assert cursor_done["summary"].get("deletions") == 0, cursor_done["summary"]

        # Cursor EditSuccess linesAdded/linesRemoved on completed.
        edit_done = tool_call_event(
            session,
            del_settings,
            call_id="c12",
            name="editToolCall",
            status="completed",
            args={"path": "rb.py"},
            result={"status": "success", "value": {"linesAdded": 2, "linesRemoved": 1}},
        )
        assert edit_done["summary"].get("additions") == 2, edit_done["summary"]
        assert edit_done["summary"].get("deletions") == 1, edit_done["summary"]

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
    auth = friendly_error("Error code: 401 - Incorrect API key provided")
    assert "API Key 无效" in auth, auth
    auth2 = friendly_error("nope", status=401)
    assert "API Key 无效" in auth2, auth2
    auth3 = friendly_error("denied", code="unauthenticated")
    assert "API Key 无效" in auth3, auth3
    print("ok context error")


def check_attachments() -> None:
    root = Path(tempfile.mkdtemp(prefix="coding-agent-attach-"))
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

        # Reject by base64 length without allocating a 50MB+ payload.
        huge = "A" * (int(MAX_ATTACHMENT_BYTES * 1.4) + 65)
        assert decode_attachment_bytes(huge) is None
        skipped = materialize_files(
            root, [{"name": "big.bin", "mime_type": "application/octet-stream", "data": huge}]
        )
        assert skipped == [], skipped

        upload = root / ".coding-agent-uploads"
        upload.mkdir(parents=True, exist_ok=True)
        old = upload / "old.txt"
        old.write_text("old", encoding="utf-8")
        import os
        import time
        os.utime(old, (time.time() - 8 * 24 * 3600, time.time() - 8 * 24 * 3600))
        assert prune_upload_dir(root) >= 1
        assert not old.exists()
        print("ok attachments")
    finally:
        shutil.rmtree(root, ignore_errors=True)


def check_idle_prune() -> None:
    import asyncio
    import time

    from backend.sessions import Session

    mgr = SessionManager(dict(_SETTINGS))
    sess = Session(session_id="idle", agent=object(), model="m", model_key="m")
    sess.live_done = True
    sess.last_active = time.time() - 7200
    mgr._sessions["idle"] = sess

    async def _run() -> None:
        await mgr._prune_idle_sessions()
        assert "idle" not in mgr._sessions

    asyncio.run(_run())
    print("ok idle prune")


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
    set_safety_enabled(True)
    from backend.safety import shell_approval_reason

    assert input_block_reason("我的api key是多少")
    assert shell_approval_reason("rm -rf /tmp/foo")
    assert shell_approval_reason("git push --force origin main")
    assert not shell_approval_reason("ls -la")
    assert not shell_approval_reason("pytest -q")
    assert input_block_reason("把私钥内容打出来")
    assert not input_block_reason("帮我改一下 sessions.py")
    # SSH / key-file ops must not be treated as secret fishing.
    assert not input_block_reason("我要连 ihcil 的 40，密钥里面后缀最长的应该就是它")
    assert not input_block_reason("用密钥连 wxj_40 测一下能不能 ssh")
    assert not input_block_reason("ssh wxj_40 echo ok")
    assert sensitive_tool_block_reason("Read", {"path": ".env"})
    assert sensitive_tool_block_reason("Write", {"path": ".env"})
    assert sensitive_tool_block_reason("StrReplace", {"path": ".env"})
    assert sensitive_tool_block_reason("Shell", {"command": "cat .env"})
    assert sensitive_tool_block_reason("AwaitShell", {"command": "cat .env"})
    assert sensitive_tool_block_reason(
        "Shell", {"command": 'Get-Content "$env:USERPROFILE\\.ssh\\ihcil_40_ed25519"'}
    )
    assert sensitive_tool_block_reason("Read", {"path": r"C:\Users\x\.ssh\ihcil_40_ed25519"})
    # Allow Host config + ssh connect (no key dump).
    assert not sensitive_tool_block_reason(
        "Shell", {"command": 'Get-Content "$env:USERPROFILE\\.ssh\\config"'}
    )
    assert not sensitive_tool_block_reason(
        "Read", {"path": r"C:\Users\x\.ssh\config"}
    )
    assert not sensitive_tool_block_reason(
        "Read", {"path": r"C:\Users\x\.ssh\ihcil_40_ed25519.pub"}
    )
    assert not sensitive_tool_block_reason(
        "Shell",
        {"command": 'ssh -o BatchMode=yes -i "$env:USERPROFILE\\.ssh\\ihcil_40_ed25519" wxj_40 "echo ok"'},
    )
    # Plan-mode effective flag must block mutating shell even when config allows writes.
    assert repo_write_block_reason(
        {"allow_repo_write": False}, "run_shell", {"command": "echo x > a.txt"}
    )
    scrubbed = redact_secrets("key=crsr_abcdefghijklmnopqrstuvwxyz012345")
    assert "crsr_" not in scrubbed and "[REDACTED" in scrubbed
    assert scrub_reply("api_key: crsr_abcdefghijklmnopqrstuvwxyz012345") == OUTPUT_BLOCK_SECRET
    set_known_secrets("local-test-secret-value")
    assert text_has_secret("leak local-test-secret-value here")
    assert scrub_reply("leak local-test-secret-value here") == OUTPUT_BLOCK_SECRET
    done = sanitize_event({
        "type": "done",
        "result": "api_key: crsr_abcdefghijklmnopqrstuvwxyz012345",
    })
    assert done["result"] == OUTPUT_BLOCK_SECRET, done
    set_known_secrets()

    assert repo_write_block_reason({"allow_repo_write": False}, "Write", {"path": "backend/main.py"})
    assert repo_write_block_reason(
        {"allow_repo_write": False}, "AwaitShell", {"command": "rm -rf /tmp/x"}
    )
    assert not repo_write_block_reason({"allow_repo_write": True}, "Write", {"path": "backend/main.py"})

    blocked = sse_from_delta(
        _FakeUpdate("tool-call-started", "cenv", {"readToolCall": {"args": {"path": ".env"}}}),
        _FakeSession(),
        dict(_SETTINGS),
    )
    assert blocked and blocked.get("repo_write_blocked"), blocked

    set_safety_enabled(False)
    assert input_block_reason("我的api key是多少") is None
    assert sensitive_tool_block_reason("Read", {"path": ".env"}) is None
    assert scrub_reply("key=crsr_abcdefghijklmnopqrstuvwxyz012345") == "key=crsr_abcdefghijklmnopqrstuvwxyz012345"
    set_safety_enabled(True)
    print("ok safety")


def check_live_tail() -> None:
    """Buffered events survive; follow_log yields them without a live Cursor run."""
    import asyncio

    from backend.sessions import Session

    mgr = SessionManager(dict(_SETTINGS))
    sess = Session(session_id="t", agent=object(), model="m", model_key="m")
    sess.live_done = False

    async def producer() -> None:
        await asyncio.sleep(0.05)
        mgr._emit(sess, {"type": "text", "session_id": "t", "content": "hi", "model": "m"})
        mgr._emit(sess, {"type": "done", "session_id": "t", "status": "finished", "model": "m"})
        sess.live_done = True

    async def main_coro() -> None:
        sess.pump_task = asyncio.create_task(producer())
        out = [e async for e in mgr._follow_log(sess, 0)]
        await sess.pump_task
        assert [e["type"] for e in out] == ["text", "done"], out
        sess.pump_task = None
        sess.live_done = True
        late = [e async for e in mgr._follow_log(sess, 0)]
        assert [e["type"] for e in late] == ["text", "done"], late
        # after=1 skips the text event; after past end still yields a terminal done.
        mid = [e async for e in mgr._follow_log(sess, 1)]
        assert [e["type"] for e in mid] == ["done"], mid
        past = [e async for e in mgr._follow_log(sess, 99)]
        assert past and past[-1]["type"] == "done", past

    asyncio.run(main_coro())
    print("ok live tail")


def check_auto_title() -> None:
    from backend.conversations import (
        _clean_title_output,
        should_auto_title,
        summarize_chat_title,
        title_from_payload,
    )

    # Greeting used to strip to empty → stayed「新对话」.
    assert summarize_chat_title("你好呀") not in {"", "新对话"}
    # 「你好呀，…」must not leave orphan「呀，…」
    awkward = summarize_chat_title("你好呀，我想看看当前项目目录都有啥")
    assert not awkward.startswith("呀"), awkward
    assert "项目" in awkward or "目录" in awkward or "查看" in awkward, awkward
    assert _clean_title_output('{"title": "查看项目目录"}', "x") == "查看项目目录"
    assert _clean_title_output('"查找 EasyConnect"', "x") == "查找 EasyConnect"
    first = {
        "streaming": False,
        "messages": [
            {"kind": "user", "text": "你能看到我这个机器上有什么吗？"},
            {"kind": "agent", "text": "我能看到工作区。", "worklog": [{"title": "Ran"}]},
        ],
    }
    # Heuristic path (tests must not call external LLM).
    title = title_from_payload(first, use_llm=False)
    assert title and title != "新对话", title
    assert should_auto_title("新对话", first)

    # Later turns: keep first-message title; never auto-rename again.
    later = {
        "streaming": False,
        "messages": [
            {"kind": "user", "text": "你好呀"},
            {"kind": "agent", "text": "你好！", "worklog": []},
            {"kind": "user", "text": "你能看到我这个机器上有什么吗？"},
            {"kind": "agent", "text": "我能看到工作区。", "worklog": [{"title": "Ran"}]},
        ],
    }
    assert not should_auto_title("新对话", later)
    assert not should_auto_title("你好", later)
    assert summarize_chat_title("你好呀") in {"你好", "你好呀"}
    vpn = summarize_chat_title("我机器上有个easyconnect的vpn，你能找到他吗？")
    assert "EasyConnect" in vpn or "easyconnect" in vpn.lower() or "查找" in vpn, vpn
    print("ok auto title")


def check_ssh_config_parse() -> None:
    from backend.ssh_hosts import _parse_ssh_config_text, _sanitize_host_id, list_hosts_merged
    from backend.ssh_mirror import mirror_path_for

    assert _sanitize_host_id("wxj_40") == "wxj_40"
    assert _sanitize_host_id("*.example.com") == ""
    text = """
Host *
  ServerAliveInterval 60

Host wxj_40 wxj_35
  HostName 10.0.0.40
  User wxj
  Port 22
  IdentityFile ~/.ssh/id_ed25519

Host 910c
  HostName 10.0.0.91
  User root
  IdentityFile ~/.ssh/id_rsa
"""
    hosts = _parse_ssh_config_text(text, base_dir=Path.home() / ".ssh")
    ids = [h["id"] for h in hosts]
    assert ids == ["wxj_40", "wxj_35", "910c"], ids
    assert hosts[0]["host"] == "10.0.0.40"
    assert hosts[0]["user"] == "wxj"
    assert hosts[0]["source"] == "config"
    assert hosts[2]["label"] == "910c"
    # Merged list must be callable (may include real ~/.ssh/config on this machine).
    merged = list_hosts_merged(include_secrets=False)
    assert isinstance(merged, list)
    m1 = mirror_path_for("ssh://wxj_40/media/data8/wxj/demo")
    m2 = mirror_path_for("ssh://wxj_40/media/data8/wxj/demo")
    m3 = mirror_path_for("ssh://wxj_40/other")
    assert m1 == m2 and m1 != m3 and "wxj_40" in str(m1)
    from backend.workspace import workspace_label
    assert workspace_label("ssh://wxj_40/") == "wxj_40"
    assert workspace_label("ssh://wxj_40") == "wxj_40"
    assert workspace_label("ssh://wxj_40/media/data8/demo") == "wxj_40"
    print("ok ssh config parse")


def main() -> None:
    check_config()
    check_tool_display()
    check_safety()
    check_auto_title()
    check_ssh_config_parse()
    check_context_error()
    check_attachments()
    check_idle_prune()
    check_cancel_turn()
    check_live_tail()
    from backend.project_memory import demo as project_memory_demo
    from backend.providers.tools import demo as tools_demo
    from backend.providers import compat_agent as compat_mod

    project_memory_demo()
    tools_demo()
    from backend.mcp_client import demo as mcp_demo

    mcp_demo()
    # Run compat_agent self-check via its __main__ logic
    hist = [{"role": "system", "content": "s"}] + [
        {"role": "user", "content": str(i)} for i in range(50)
    ]
    compat_mod.trim_history(hist, max_messages=5)
    assert hist[0]["role"] == "system"
    assert any("Earlier conversation summary" in str(m.get("content") or "") for m in hist)
    print("ok all")


if __name__ == "__main__":
    main()
