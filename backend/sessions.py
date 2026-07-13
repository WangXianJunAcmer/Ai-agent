"""One chat session's in-memory state (agent handle, turn, safety flags)."""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass, field


def model_key(model: str | dict | None) -> str:
  """Stable cache key so switching model params forces a new agent."""
  if isinstance(model, dict):
    return json.dumps(
      {"id": model.get("id"), "params": model.get("params") or []},
      sort_keys=True,
      ensure_ascii=False,
    )
  return str(model or "")


@dataclass
class Session:
  session_id: str
  agent: object
  model: str
  model_key: str = ""
  model_selection: str | dict | None = None
  lock: asyncio.Lock = field(default_factory=asyncio.Lock)
  active_run: object | None = None
  # Bumped on cancel so a dying stream knows it was interrupted.
  turn: int = 0
  safety_injected: bool = False
  identity_injected: bool = False
  # Detached turn buffer: survives SSE disconnect so refresh can /follow.
  live_events: list[dict] = field(default_factory=list)
  live_done: bool = True
  pump_task: asyncio.Task | None = None
  # Wall-clock for idle prune (updated on send/stream/follow).
  last_active: float = 0.0
