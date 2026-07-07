"""Portable Python entrypoint for Ai-agent."""

from __future__ import annotations

import sys
from pathlib import Path


def _ensure_python() -> None:
    if sys.version_info < (3, 10):
        raise SystemExit("Need Python 3.10+ (cursor-sdk requirement).")


def _ensure_env(root: Path) -> None:
    if not (root / ".env").is_file():
        raise SystemExit("Missing .env - copy .env.example and set CURSOR_API_KEY.")


def main() -> None:
    root = Path(__file__).resolve().parent
    _ensure_python()
    _ensure_env(root)
    sys.path.insert(0, str(root))
    from backend.main import main as backend_main

    backend_main()


if __name__ == "__main__":
    main()
