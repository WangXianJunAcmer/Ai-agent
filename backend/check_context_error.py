"""Self-check: context-overflow errors get a clear Chinese hint."""

from __future__ import annotations

from backend.sessions import SessionManager


def main() -> None:
    mgr = SessionManager(
        {
            "host_root": ".",
            "api_key": "x",
            "model": "composer-2.5",
            "runtime": "local",
        }
    )
    out = mgr._friendly_error("Prompt is too long: context length limit exceeded")
    assert "上下文已超限" in out, out
    assert "Prompt is too long" in out, out
    plain = mgr._friendly_error("network timeout")
    assert plain == "network timeout", plain
    print("ok context error")


if __name__ == "__main__":
    main()
