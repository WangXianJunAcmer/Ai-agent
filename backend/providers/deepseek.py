"""DeepSeek provider — same openai-compatible loop, different base_url + key."""

from __future__ import annotations

from backend.providers.compat_agent import CompatSessionAgent, require_key

PROVIDER_NAME = "deepseek"


def build_handle(settings: dict) -> CompatSessionAgent:
    require_key(settings, PROVIDER_NAME)
    return CompatSessionAgent(PROVIDER_NAME)
