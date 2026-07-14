import os
from pathlib import Path

import yaml
from dotenv import load_dotenv

from backend.providers import normalize_provider, require_implemented

ROOT = Path(__file__).resolve().parent.parent


def load_settings() -> dict:
    load_dotenv(ROOT / ".env")
    with open(ROOT / "config.yaml", encoding="utf-8") as f:
        cfg = yaml.safe_load(f) or {}

    host_rel = cfg.get("host_project_root", ".")
    host_root = (ROOT / host_rel).resolve()

    server = cfg.get("server") or {}
    agent = cfg.get("agent") or {}
    cloud = agent.get("cloud") or {}
    providers_cfg = cfg.get("providers") or {}

    provider = normalize_provider(agent.get("provider"))
    require_implemented(provider)

    cursor_key = (os.getenv("CURSOR_API_KEY") or "").strip()
    openai_key = (os.getenv("OPENAI_API_KEY") or "").strip()
    deepseek_key = (os.getenv("DEEPSEEK_API_KEY") or "").strip()

    if provider == "cursor":
        api_key = cursor_key
        if not api_key:
            raise RuntimeError(
                "CURSOR_API_KEY is not set. Copy .env.example to .env and fill it in."
            )
    elif provider == "openai":
        api_key = openai_key
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY is not set for agent.provider=openai.")
    elif provider == "deepseek":
        api_key = deepseek_key
        if not api_key:
            raise RuntimeError("DEEPSEEK_API_KEY is not set for agent.provider=deepseek.")
    else:
        api_key = ""

    openai_cfg = providers_cfg.get("openai") or {}
    deepseek_cfg = providers_cfg.get("deepseek") or {}

    return {
        "root": ROOT,
        "host_root": host_root,
        "provider": provider,
        "api_key": api_key,
        "cursor_api_key": cursor_key,
        "openai_api_key": openai_key,
        "deepseek_api_key": deepseek_key,
        "openai_base_url": (openai_cfg.get("base_url") or "https://api.openai.com/v1").strip(),
        "deepseek_base_url": (
            deepseek_cfg.get("base_url") or "https://api.deepseek.com"
        ).strip(),
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


def cursor_api_key(settings: dict) -> str:
    """Cursor catalog / SDK key. Prefer cursor_api_key; api_key is active-provider key."""
    return str(settings.get("cursor_api_key") or settings.get("api_key") or "")

