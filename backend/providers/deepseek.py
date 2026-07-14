"""DeepSeek provider — same openai-compatible loop, different base_url + key."""

from __future__ import annotations

from backend.providers.compat_agent import (
    CompatSessionAgent,
    default_model,
    model_options,
    require_key,
)

PROVIDER_NAME = "deepseek"


def build_handle(settings: dict) -> CompatSessionAgent:
    require_key(settings, PROVIDER_NAME)
    return CompatSessionAgent(PROVIDER_NAME)


def provider_models() -> list[dict]:
    return model_options(PROVIDER_NAME)


def provider_default_model() -> str:
    return default_model(PROVIDER_NAME)
