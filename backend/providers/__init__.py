"""Provider registry.

  - cursor  → Cursor SDK (runtime.SessionManager)
  - openai / deepseek → openai SDK (compatible HTTP) + local tools
"""

from __future__ import annotations

from backend.providers.base import AgentProvider

IMPLEMENTED = frozenset({"cursor", "openai", "deepseek"})
RESERVED = frozenset({"cursor", "openai", "deepseek"})
COMPAT_PROVIDERS = frozenset({"openai", "deepseek"})


def normalize_provider(name: str | None) -> str:
    p = (name or "cursor").strip().lower() or "cursor"
    if p not in RESERVED:
        raise RuntimeError(
            f"Unknown agent.provider={name!r}. Supported: {', '.join(sorted(RESERVED))}"
        )
    return p


def require_implemented(provider: str) -> None:
    p = normalize_provider(provider)
    if p in IMPLEMENTED:
        return
    raise RuntimeError(
        f"agent.provider={p!r} is reserved under backend/providers/ but not wired yet. "
        f"Set agent.provider: cursor, or implement providers/{p}.py and add it to IMPLEMENTED."
    )


def describe_provider(settings: dict) -> dict:
    p = normalize_provider(settings.get("provider"))
    return {
        "provider": p,
        "implemented": p in IMPLEMENTED,
        "reserved": sorted(RESERVED),
        "compat_providers": sorted(COMPAT_PROVIDERS),
    }


def build_compat_handle(settings: dict, provider: str):
    """Build OpenAI-compatible session handle (openai / deepseek)."""
    p = normalize_provider(provider)
    if p == "openai":
        from backend.providers.openai import build_handle

        return build_handle(settings)
    if p == "deepseek":
        from backend.providers.deepseek import build_handle

        return build_handle(settings)
    raise RuntimeError(f"not a compat provider: {p}")


__all__ = [
    "AgentProvider",
    "IMPLEMENTED",
    "COMPAT_PROVIDERS",
    "RESERVED",
    "build_compat_handle",
    "describe_provider",
    "normalize_provider",
    "require_implemented",
]
