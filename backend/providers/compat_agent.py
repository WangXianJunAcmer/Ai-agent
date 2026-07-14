"""OpenAI-compatible chat + local tool loop → widget SSE (OpenAI / DeepSeek).

# ponytail: openai SDK only. DeepSeek = same client, different base_url + key.
"""

from __future__ import annotations

import json
from typing import Any, Callable

from openai import AsyncOpenAI

from backend.attachments import image_attachments, materialize_files, upload_meta
from backend.providers.tools import make_tool_kit, run_tool
from backend.repo_write_guard import identity_prefix
from backend.safety import policy_prefix
from backend.tool_display import tool_call_event

_MAX_ROUNDS = 24

PROVIDER_DEFAULTS = {
    "openai": {
        "key": "openai_api_key",
        "base_url": "openai_base_url",
        "default_model": "gpt-4o",
        "models": [
            {"id": "gpt-4o", "display_name": "GPT-4o"},
            {"id": "gpt-4.1", "display_name": "GPT-4.1"},
            {"id": "gpt-4.1-mini", "display_name": "GPT-4.1 mini"},
            {"id": "o4-mini", "display_name": "o4-mini"},
        ],
    },
    "deepseek": {
        "key": "deepseek_api_key",
        "base_url": "deepseek_base_url",
        "default_model": "deepseek-v4-flash",
        "models": [
            {"id": "deepseek-v4-flash", "display_name": "DeepSeek V4 Flash"},
            {"id": "deepseek-v4-pro", "display_name": "DeepSeek V4 Pro"},
        ],
    },
}


def model_options(provider: str) -> list[dict]:
    meta = PROVIDER_DEFAULTS.get(provider) or PROVIDER_DEFAULTS["openai"]
    return list(meta["models"])


def default_model(provider: str) -> str:
    meta = PROVIDER_DEFAULTS.get(provider) or PROVIDER_DEFAULTS["openai"]
    return str(meta["default_model"])


def require_key(settings: dict, provider: str) -> str:
    meta = PROVIDER_DEFAULTS[provider]
    key = (settings.get(meta["key"]) or "").strip()
    if not key:
        env = "OPENAI_API_KEY" if provider == "openai" else "DEEPSEEK_API_KEY"
        raise RuntimeError(f"{env} is not set. Add it to .env and restart.")
    return key


def build_client(settings: dict, provider: str) -> AsyncOpenAI:
    meta = PROVIDER_DEFAULTS[provider]
    return AsyncOpenAI(
        api_key=require_key(settings, provider),
        base_url=settings.get(meta["base_url"]),
    )


def _system_prompt(settings: dict, mode: str) -> str:
    root = settings["host_root"]
    plan = (
        "You are in plan mode: analyze and propose changes; do not write files or run mutating shell."
        if mode == "plan"
        else "You are in agent mode: use tools to inspect and edit the workspace to complete the task."
    )
    return (
        "You are a local coding agent.\n"
        f"Workspace root: {root}\n"
        f"{plan}\n"
        "Prefer read_file / grep / glob_files / list_dir before shell. "
        "Paths are relative to the workspace root. Reply in the user's language."
    )


def build_user_prompt(
    message: str,
    attachments: list[dict] | None,
    settings: dict,
    session,
) -> tuple[str, dict]:
    prompt = (message or "").strip()
    files = materialize_files(settings["host_root"], attachments)
    images = image_attachments(attachments)
    if files:
        listing = "\n".join(f"- {f['path']}" for f in files)
        note = "用户上传了以下文件（已保存到工作区，请按需读取这些路径）：\n" + listing
        prompt = f"{prompt}\n\n{note}" if prompt else note
    if images:
        names = ", ".join((i.get("name") or "image") for i in images)
        note = (
            f"用户上传了图片: {names}。"
            "（当前路径以文本/工具为主；请结合用户文字理解。）"
        )
        prompt = f"{prompt}\n\n{note}" if prompt else note
    if not prompt:
        prompt = "请继续。"
    if session is not None:
        prompt = policy_prefix(session) + identity_prefix(session, settings) + prompt
    return prompt, upload_meta(attachments, files)


class CompatSessionAgent:
    """Per-chat handle: OpenAI-compatible message history."""

    def __init__(self, provider: str):
        self.provider = provider
        self.messages: list[dict[str, Any]] = []


async def stream_compat_turn(
    session,
    settings: dict,
    *,
    message: str,
    mode: str,
    attachments: list[dict] | None,
    turn: int,
    emit: Callable[[dict], None],
) -> str:
    """One agent turn: stream tokens, run tools, emit widget SSE. Returns done status."""
    handle: CompatSessionAgent = session.agent
    model = session.model or default_model(handle.provider)
    allow_write = bool(settings.get("allow_repo_write", True)) and mode != "plan"
    tools, executors = make_tool_kit(settings, allow_write=allow_write)
    client = build_client(settings, handle.provider)

    user_text, meta = build_user_prompt(message, attachments, settings, session)
    if meta.get("images") or meta.get("files"):
        emit({
            "type": "upload",
            "session_id": session.session_id,
            "model": session.model,
            **meta,
        })
    emit({
        "type": "model_resolved",
        "session_id": session.session_id,
        "model": session.model,
        "resolved_model": model,
        "resolved_model_label": model,
    })

    if not handle.messages:
        handle.messages.append({"role": "system", "content": _system_prompt(settings, mode)})
    else:
        # Refresh system prompt when mode/settings change (replace first system).
        handle.messages[0] = {"role": "system", "content": _system_prompt(settings, mode)}

    handle.messages.append({"role": "user", "content": user_text})
    final_status = "finished"

    try:
        for _ in range(_MAX_ROUNDS):
            if session.turn != turn:
                return "cancelled"

            # Accumulate one completion (stream text to UI; buffer tool_calls).
            content_parts: list[str] = []
            tool_acc: dict[int, dict[str, str]] = {}
            finish_reason = None
            thinking_parts: list[str] = []

            request: dict[str, Any] = {
                "model": model,
                "messages": handle.messages,
                "tools": tools or None,
                "stream": True,
            }
            if handle.provider == "deepseek":
                # V4 thinking mode supports tools. Keep reasoning_content in
                # assistant messages below or the next tool round returns 400.
                request["reasoning_effort"] = "max"
                request["extra_body"] = {"thinking": {"type": "enabled"}}
            stream = await client.chat.completions.create(
                **request,
            )
            async for chunk in stream:
                if session.turn != turn:
                    return "cancelled"
                if not chunk.choices:
                    continue
                choice = chunk.choices[0]
                finish_reason = choice.finish_reason or finish_reason
                delta = choice.delta
                if delta is None:
                    continue
                if delta.content:
                    content_parts.append(delta.content)
                    emit({
                        "type": "text",
                        "session_id": session.session_id,
                        "content": delta.content,
                        "model": session.model,
                    })
                # DeepSeek reasoner may stream reasoning_content
                reasoning = getattr(delta, "reasoning_content", None)
                if reasoning:
                    thinking_parts.append(str(reasoning))
                    emit({
                        "type": "thinking",
                        "session_id": session.session_id,
                        "content": str(reasoning),
                        "model": session.model,
                    })
                if delta.tool_calls:
                    for tc in delta.tool_calls:
                        idx = int(tc.index if tc.index is not None else 0)
                        slot = tool_acc.setdefault(idx, {"id": "", "name": "", "arguments": ""})
                        if tc.id:
                            slot["id"] = tc.id
                        if tc.function:
                            if tc.function.name:
                                slot["name"] = tc.function.name
                            if tc.function.arguments:
                                slot["arguments"] += tc.function.arguments

            assistant_msg: dict[str, Any] = {"role": "assistant", "content": "".join(content_parts) or None}
            if thinking_parts:
                assistant_msg["reasoning_content"] = "".join(thinking_parts)
            if tool_acc:
                assistant_msg["tool_calls"] = [
                    {
                        "id": slot["id"] or f"call_{idx}",
                        "type": "function",
                        "function": {
                            "name": slot["name"],
                            "arguments": slot["arguments"] or "{}",
                        },
                    }
                    for idx, slot in sorted(tool_acc.items())
                    if slot["name"]
                ]
            handle.messages.append(assistant_msg)

            if not tool_acc:
                break

            # Execute tools then continue the loop.
            blocked_turn = False
            for idx, slot in sorted(tool_acc.items()):
                if not slot["name"]:
                    continue
                if session.turn != turn:
                    return "cancelled"
                call_id = slot["id"] or f"call_{idx}"
                name = slot["name"]
                raw_args = slot["arguments"] or "{}"
                try:
                    args_obj = json.loads(raw_args)
                except json.JSONDecodeError:
                    args_obj = {"_raw": raw_args}

                ev = tool_call_event(
                    session,
                    settings,
                    call_id=call_id,
                    name=name,
                    status="running",
                    args=args_obj,
                    result="",
                    include_empty=True,
                    check_repo_write=True,
                )
                emit(ev)
                if ev.get("repo_write_blocked"):
                    emit({
                        "type": "text",
                        "session_id": session.session_id,
                        "content": ev["repo_write_blocked"],
                        "model": session.model,
                    })
                    result = ev["repo_write_blocked"]
                    blocked_turn = True
                else:
                    result = run_tool(executors, name, raw_args)

                emit(
                    tool_call_event(
                        session,
                        settings,
                        call_id=call_id,
                        name=name,
                        status="completed",
                        args=args_obj,
                        result=result,
                        include_empty=True,
                    )
                )
                handle.messages.append({
                    "role": "tool",
                    "tool_call_id": call_id,
                    "content": result if isinstance(result, str) else json.dumps(result, ensure_ascii=False),
                })
            if blocked_turn:
                final_status = "cancelled"
                break
        else:
            emit({
                "type": "text",
                "session_id": session.session_id,
                "content": f"（已达工具轮次上限 {_MAX_ROUNDS}）",
                "model": session.model,
            })

    except Exception as err:
        emit({
            "type": "error",
            "session_id": session.session_id,
            "content": str(err),
            "model": session.model,
        })
        final_status = "error"

    return final_status
