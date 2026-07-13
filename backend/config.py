import os
from pathlib import Path

import yaml
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent


def load_settings() -> dict:
    load_dotenv(ROOT / ".env")
    with open(ROOT / "config.yaml", encoding="utf-8") as f:
        cfg = yaml.safe_load(f) or {}

    host_rel = cfg.get("host_project_root", "..")
    host_root = (ROOT / host_rel).resolve()

    server = cfg.get("server") or {}
    agent = cfg.get("agent") or {}
    cloud = agent.get("cloud") or {}

    api_key = (os.getenv("CURSOR_API_KEY") or "").strip()
    if not api_key:
        raise RuntimeError("CURSOR_API_KEY is not set. Copy .env.example to .env and fill it in.")

    return {
        "root": ROOT,
        "host_root": host_root,
        "api_key": api_key,
        "host": server.get("host", "127.0.0.1"),
        "port": int(server.get("port", 8765)),
        "reload": bool(server.get("reload", False)),
        "model": agent.get("model", "composer-2.5"),
        "runtime": agent.get("runtime", "local"),
        # Coding sidecar defaults to writable; set false for read-only embed hosts.
        "allow_repo_write": bool(agent.get("allow_repo_write", True)),
        # Bidirectional secret guards (input block, output scrub, .env read block).
        "safety_enabled": bool(agent.get("safety_enabled", True)),
        "cloud_repo_url": (cloud.get("repo_url") or "").strip(),
        "cloud_starting_ref": cloud.get("starting_ref", "main"),
        "cloud_auto_create_pr": bool(cloud.get("auto_create_pr", False)),
    }
