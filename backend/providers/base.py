"""Provider contract: map any backend into the widget SSE event shape.

Widget / SessionManager consume dict events with type in:
  status | text | thinking | planning | tool_call | upload | model_resolved | error | done

# OpenAI/DeepSeek: openai SDK (compatible base_url) + local tool loop → same SSE.
"""

from __future__ import annotations

from typing import Any, AsyncIterator, Protocol


class AgentProvider(Protocol):
    """One backend (Cursor SDK, OpenAI, DeepSeek, …)."""

    name: str

    async def start(self) -> None: ...

    async def stop(self) -> None: ...

    async def stream_turn(
        self,
        session_id: str | None,
        message: str,
        *,
        model: str | dict | None = None,
        mode: str = "agent",
        attachments: list[dict] | None = None,
    ) -> AsyncIterator[dict[str, Any]]:
        """Yield widget SSE payloads until a terminal `done` / `error`."""
        ...

    async def cancel(self, session_id: str | None) -> None: ...
