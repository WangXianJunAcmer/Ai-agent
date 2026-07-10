"""Minimal self-check for tool_call payload parsing / summary labels."""
from __future__ import annotations

from backend.sessions import SessionManager


class _FakeUpdate:
    def __init__(self, update_type: str, call_id: str, tool_call: dict):
        self.type = update_type
        self.call_id = call_id
        self.tool_call = tool_call


class _FakeSession:
    session_id = "s1"
    model = "composer-2.5"


def main() -> None:
    mgr = SessionManager({"host_root": ".", "api_key": "x", "model": "composer-2.5", "runtime": "local",
                          "cloud_repo_url": "", "cloud_starting_ref": "main", "cloud_auto_create_pr": False})
    session = _FakeSession()

    started = mgr._delta_event(
        _FakeUpdate("tool-call-started", "c1", {"shellToolCall": {"args": {"command": "ls -la apps"}}}),
        session,
    )
    assert started and started["name"] == "shell", started
    assert "ls -la apps" in started["summary"]["title"], started["summary"]

    read_evt = mgr._delta_event(
        _FakeUpdate("tool-call-started", "c2", {"readToolCall": {"args": {"path": "server/app.py"}}}),
        session,
    )
    assert read_evt and read_evt["name"] == "read", read_evt
    assert "server/app.py" in read_evt["summary"]["title"], read_evt["summary"]

    named = mgr._delta_event(
        _FakeUpdate("tool-call-completed", "c3", {"name": "Grep", "args": {"pattern": "ai_assistant"}}),
        session,
    )
    assert named and named["name"] == "Grep", named
    assert named["status"] == "completed", named

    typed_shell = mgr._delta_event(
        _FakeUpdate("tool-call-started", "c4", {"type": "shell", "args": {"command": "python3 -c 'print(1)'"}}),
        session,
    )
    assert typed_shell and typed_shell["name"] == "shell", typed_shell
    assert "python3" in typed_shell["summary"]["title"], typed_shell["summary"]

    print("ok")


if __name__ == "__main__":
    main()
