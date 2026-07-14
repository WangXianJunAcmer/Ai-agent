"""Cursor SDK provider — live path is still `backend.runtime.SessionManager`.

When GPT/DeepSeek land, lift SessionManager behind AgentProvider and keep this
module as the Cursor adapter. Until then this file only documents the slot.
"""

from __future__ import annotations

PROVIDER_NAME = "cursor"

# Runtime entry: backend.runtime.SessionManager (AsyncClient + agents.create).
