"""Config-only smoke check (no CURSOR_API_KEY / cursor-sdk required)."""

from __future__ import annotations

import os
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent


def main() -> int:
    cfg_path = ROOT / "config.yaml"
    with open(cfg_path, encoding="utf-8") as f:
        cfg = yaml.safe_load(f) or {}

    host_root = (ROOT / cfg.get("host_project_root", "..")).resolve()
    port = (cfg.get("server") or {}).get("port", 8765)

    assert host_root.is_dir(), f"host_project_root does not exist: {host_root}"
    assert (ROOT / "frontend" / "widget.js").is_file(), "missing frontend/widget.js"
    print(f"ok host_root={host_root} port={port}")
    return 0


if __name__ == "__main__":
    if not (ROOT / "config.yaml").exists():
        print("missing config.yaml", file=sys.stderr)
        raise SystemExit(1)
    raise SystemExit(main())
