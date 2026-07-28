"""OpenAI-compatible chat + local tool loop → widget SSE (OpenAI / DeepSeek).

# ponytail: openai SDK only. DeepSeek = same client, different base_url + key.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any, Callable

from openai import AsyncOpenAI

from backend.attachments import image_attachments, materialize_files, upload_meta
from backend.providers.tools import make_tool_kit, run_tool
from backend.repo_write_guard import identity_prefix
from backend.safety import policy_prefix
from backend.tool_display import tool_call_event
from backend.turn_changes import TurnChangeTracker, store_tracker

_MAX_ROUNDS = 24
# ponytail: message-count cap, not tokens; raise / summarize if long threads still 400.
_MAX_HISTORY_MESSAGES = 40
_EXPLORE_ROUNDS = 8
_GENERAL_SUB_ROUNDS = 12
_MAX_SUBAGENT_DEPTH = 2  # root=0 → child=1 → grandchild=2
_APPROVAL_TIMEOUT_SEC = 120.0


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


def _workspace_env_block(settings: dict) -> str:
    """Tell the model whether tools run locally or on SSH remote (and which OS/shell)."""
    import os
    from backend.ssh_workspace import detect_remote_os, is_ssh_uri, parse_ssh_uri

    root = str(settings.get("host_root") or "")
    if not is_ssh_uri(root):
        local = "Windows (cmd/PowerShell)" if os.name == "nt" else "Unix (bash/sh)"
        return (
            "You are a coding agent on the LOCAL machine that runs Coding Agent.\n"
            f"Workspace root: {root}\n"
            f"Local OS/shell: {local}\n"
        )

    host_id, remote = parse_ssh_uri(root)
    label = host_id
    login = ""
    try:
        from backend.ssh_hosts import get_host

        host = get_host(host_id, include_secrets=False)
        label = str(host.get("label") or host_id).strip() or host_id
        user = str(host.get("user") or "").strip()
        hostname = str(host.get("host") or "").strip()
        if user and hostname:
            login = f"{user}@{hostname}"
    except Exception:
        pass

    os_info: dict = {}
    try:
        os_info = detect_remote_os(host_id)
    except Exception:
        os_info = {}
    family = str(os_info.get("family") or os_info.get("system") or "unknown").lower()
    shell = str(os_info.get("shell") or ("cmd" if family == "windows" else "bash"))
    os_label = str(os_info.get("label") or family)
    if family == "windows":
        os_hint = (
            "Remote is Windows — use cmd/PowerShell-style commands and Windows paths on the REMOTE host."
        )
    else:
        os_hint = (
            "Remote is NOT Windows. Do NOT use C:\\ paths or PowerShell. "
            "Use POSIX paths and bash/sh. EasyConnect/VPN on the user's laptop is unrelated "
            "unless they explicitly ask about the local UI machine."
        )
    lines = [
        "You are a coding agent on a REMOTE machine via SSH — not on the Coding Agent server host.",
        f"SSH server: {label}" + (f" (id={host_id})" if label != host_id else ""),
    ]
    if login:
        lines.append(f"SSH login: {login}")
    lines.extend([
        f"Remote OS: {os_label} (family={family})",
        f"Remote shell for run_shell: {shell}",
        f"Remote workspace path: {remote}",
        f"Workspace URI: {root}",
        "All tools (read/grep/shell/…) already execute on this REMOTE host.",
        os_hint,
    ])
    return "\n".join(lines) + "\n"


def _system_prompt(settings: dict, mode: str) -> str:
    from backend.project_memory import project_memory_block

    plan = (
        "You are in plan mode: analyze and propose changes; do not write files or run mutating shell."
        if mode == "plan"
        else "You are in agent mode: use tools to inspect and edit the workspace to complete the task."
    )
    playbook = (
        "Playbook:\n"
        "- Prefer explore / task / grep / glob_files / read_file before editing.\n"
        "- Use task(subagent_type=general) for parallelizable multi-step work; "
        "explore for read-only research.\n"
        "- MCP tools are named mcp__server__tool — use them when they fit the task.\n"
        "- Prefer str_replace for edits; keep old_string unique. Use write_file only for new files "
        "or full rewrites.\n"
        "- After edits, run the smallest check that would fail (e.g. py_compile, relevant test).\n"
        "- If a tool fails, fix the approach — do not retry the identical call blindly.\n"
        "- End with what changed and how you verified.\n"
        "Paths are relative to the workspace root. Reply in the user's language."
    )
    base = (
        f"{_workspace_env_block(settings)}"
        f"{plan}\n"
        f"{playbook}"
    )
    memory = project_memory_block(settings["host_root"])
    if memory:
        return f"{base}\n\n{memory}"
    return base


def normalize_reasoning_effort(raw: str | None) -> str | None:
    """Map DeepSeek effort aliases → high|max. None → omit (API picks default).

    Docs: normal requests default high; complex Agent (tools) auto max.
    low/medium→high, xhigh→max. Don't invent a default here.
    """
    if raw is None or not str(raw).strip():
        return None
    effort = str(raw).strip().lower()
    if effort in {"low", "medium"}:
        return "high"
    if effort == "xhigh":
        return "max"
    return effort if effort in {"high", "max"} else None


def strip_unused_reasoning(messages: list[dict[str, Any]]) -> None:
    """Drop reasoning_content on assistant turns without tool_calls.

    DeepSeek: between user turns, reasoning without tools is ignored by the API
    and must NOT be kept when tools *were* used (those must stay forever).
    """
    for msg in messages:
        if msg.get("role") != "assistant":
            continue
        if msg.get("tool_calls"):
            continue
        msg.pop("reasoning_content", None)


def trim_history(messages: list[dict[str, Any]], max_messages: int = _MAX_HISTORY_MESSAGES) -> None:
    """Keep system + newest messages; fold dropped turns into a short summary note."""
    if len(messages) <= max_messages:
        return
    system = messages[0] if messages and messages[0].get("role") == "system" else None
    rest = messages[1:] if system else list(messages)
    # Reserve one slot for the summary message.
    keep_n = max_messages - (1 if system else 0) - 1
    if keep_n <= 0:
        messages[:] = [system] if system else []
        return
    cut = max(0, len(rest) - keep_n)
    while cut < len(rest) and rest[cut].get("role") == "tool":
        cut += 1
    dropped = rest[:cut]
    kept = rest[cut:]
    bits: list[str] = []
    for msg in dropped:
        role = msg.get("role")
        content = msg.get("content")
        if not isinstance(content, str) or not content.strip():
            continue
        if role == "user":
            bits.append("User: " + content.strip()[:240])
        elif role == "assistant":
            bits.append("Assistant: " + content.strip()[:240])
    summary = {
        "role": "user",
        "content": (
            "[Earlier conversation summary — details may be incomplete]\n"
            + ("\n".join(bits[-16:]) if bits else "(tool-heavy history trimmed)")
        ),
    }
    messages[:] = ([system, summary] + kept) if system else ([summary] + kept)


def apply_deepseek_thinking(
    request: dict[str, Any],
    *,
    thinking: bool = True,
    reasoning_effort: str | None = None,
) -> None:
    """OpenAI SDK: thinking in extra_body. Omit effort unless caller set it."""
    if thinking:
        request["extra_body"] = {"thinking": {"type": "enabled"}}
        effort = normalize_reasoning_effort(reasoning_effort)
        if effort:
            request["reasoning_effort"] = effort
    else:
        request["extra_body"] = {"thinking": {"type": "disabled"}}


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


async def _await_shell_approval(
    session,
    *,
    call_id: str,
    command: str,
    reason: str,
    turn: int,
    emit: Callable[[dict], None],
) -> bool:
    """Emit tool_approval and wait for /api/chat/approve (or timeout/cancel → deny)."""
    loop = asyncio.get_running_loop()
    fut: asyncio.Future = loop.create_future()
    session.pending_approval = {
        "call_id": call_id,
        "command": command,
        "reason": reason,
    }
    session.approval_future = fut
    emit({
        "type": "tool_approval",
        "session_id": session.session_id,
        "call_id": call_id,
        "command": command,
        "reason": reason,
        "model": session.model,
    })
    deadline = loop.time() + _APPROVAL_TIMEOUT_SEC
    try:
        while True:
            if session.turn != turn:
                return False
            if fut.done():
                return bool(fut.result())
            remaining = deadline - loop.time()
            if remaining <= 0:
                return False
            try:
                await asyncio.wait_for(asyncio.shield(fut), timeout=min(1.0, remaining))
            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                return False
    finally:
        session.pending_approval = None
        session.approval_future = None
        if not fut.done():
            fut.cancel()


async def _run_subagent(
    client: AsyncOpenAI,
    *,
    model: str,
    settings: dict,
    prompt: str,
    session,
    turn: int,
    emit: Callable[[dict], None],
    provider: str,
    subagent_type: str = "explore",
    depth: int = 1,
    parent_tracker=None,
) -> str:
    """Nested tool loop. explore=read-only; general=write+shell; depth-capped task/explore."""
    if depth > _MAX_SUBAGENT_DEPTH:
        return f"max subagent depth {_MAX_SUBAGENT_DEPTH} reached; summarize and continue yourself."

    kind = (subagent_type or "explore").strip().lower()
    if kind not in {"explore", "general"}:
        kind = "explore"
    allow_write = kind == "general" and bool(settings.get("allow_repo_write", True))
    guard = {**settings, "allow_repo_write": allow_write}
    tools, executors = make_tool_kit(settings, allow_write=allow_write, tracker=parent_tracker)

    # Depth gate: only allow further nesting when depth < max.
    if depth >= _MAX_SUBAGENT_DEPTH:
        tools = [
            t for t in tools
            if (t.get("function") or {}).get("name") not in {"explore", "task"}
        ]

    # MCP tools (shared pool).
    mcp_mgr = None
    try:
        from backend.mcp_client import get_mcp_manager

        mcp_mgr = get_mcp_manager(settings)
        tools = list(tools) + mcp_mgr.openai_tools()
    except Exception:
        mcp_mgr = None

    if kind == "explore":
        system = (
            "You are a read-only code explorer. Use grep/glob/read/list/MCP tools only. "
            "Answer the research question concisely with file paths and key findings. "
            "Do not edit files."
        )
        max_rounds = _EXPLORE_ROUNDS
    else:
        system = (
            "You are a nested coding sub-agent. Complete the assigned task using tools. "
            "Prefer str_replace over full-file writes. You may spawn explore/task children "
            f"(current depth {depth}/{_MAX_SUBAGENT_DEPTH}). Return a concise summary of "
            "what you did and how to verify."
        )
        max_rounds = _GENERAL_SUB_ROUNDS

    messages: list[dict[str, Any]] = [
        {"role": "system", "content": system},
        {"role": "user", "content": (prompt or "").strip() or "Survey the workspace."},
    ]
    final_text = ""
    for _ in range(max_rounds):
        if session.turn != turn:
            return f"{kind} cancelled"
        request: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "tools": tools or None,
            "stream": False,
        }
        if provider == "deepseek":
            request["extra_body"] = {"thinking": {"type": "disabled"}}
        resp = await client.chat.completions.create(**request)
        choice = resp.choices[0] if resp.choices else None
        if choice is None:
            break
        msg = choice.message
        content = msg.content or ""
        tool_calls = list(msg.tool_calls or [])
        assistant: dict[str, Any] = {"role": "assistant", "content": content or None}
        if tool_calls:
            assistant["tool_calls"] = [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {
                        "name": tc.function.name,
                        "arguments": tc.function.arguments or "{}",
                    },
                }
                for tc in tool_calls
            ]
        messages.append(assistant)
        if not tool_calls:
            final_text = content.strip()
            break
        for tc in tool_calls:
            if session.turn != turn:
                return f"{kind} cancelled"
            name = tc.function.name
            raw_args = tc.function.arguments or "{}"
            try:
                args_obj = json.loads(raw_args)
            except json.JSONDecodeError:
                args_obj = {"_raw": raw_args}
            # Nested explore/task → recurse
            if name in {"explore", "task"}:
                if name == "explore":
                    child_prompt = ""
                    if isinstance(args_obj, dict):
                        child_prompt = str(args_obj.get("query") or args_obj.get("prompt") or "").strip()
                    child_type = "explore"
                else:
                    child_prompt = ""
                    child_type = "explore"
                    if isinstance(args_obj, dict):
                        child_prompt = str(args_obj.get("prompt") or args_obj.get("query") or "").strip()
                        child_type = str(args_obj.get("subagent_type") or "explore").strip().lower()
                ev = tool_call_event(
                    session, guard, call_id=tc.id, name=name, status="running",
                    args=args_obj, result="", include_empty=True, check_repo_write=True,
                )
                emit(ev)
                result = await _run_subagent(
                    client,
                    model=model,
                    settings=settings,
                    prompt=child_prompt,
                    session=session,
                    turn=turn,
                    emit=emit,
                    provider=provider,
                    subagent_type=child_type,
                    depth=depth + 1,
                    parent_tracker=parent_tracker if child_type == "general" else None,
                )
                emit(
                    tool_call_event(
                        session, guard, call_id=tc.id, name=name, status="completed",
                        args=args_obj, result=result, include_empty=True,
                    )
                )
            elif str(name).startswith("mcp__") and mcp_mgr is not None:
                ev = tool_call_event(
                    session, guard, call_id=tc.id, name=name, status="running",
                    args=args_obj, result="", include_empty=True, check_repo_write=False,
                )
                emit(ev)
                result = await asyncio.to_thread(mcp_mgr.call, name, args_obj)
                emit(
                    tool_call_event(
                        session, guard, call_id=tc.id, name=name, status="completed",
                        args=args_obj, result=result, include_empty=True,
                    )
                )
            else:
                ev = tool_call_event(
                    session, guard, call_id=tc.id, name=name, status="running",
                    args=args_obj, result="", include_empty=True, check_repo_write=True,
                )
                emit(ev)
                if ev.get("repo_write_blocked"):
                    result = ev["repo_write_blocked"]
                else:
                    # Dangerous shell confirm also applies inside general sub-agents.
                    if name == "run_shell" and isinstance(args_obj, dict) and allow_write:
                        from backend.safety import shell_approval_reason

                        cmd = str(args_obj.get("command") or "")
                        reason = shell_approval_reason(cmd)
                        if reason:
                            ok = await _await_shell_approval(
                                session,
                                call_id=tc.id,
                                command=cmd,
                                reason=reason,
                                turn=turn,
                                emit=emit,
                            )
                            if session.turn != turn:
                                return f"{kind} cancelled"
                            if not ok:
                                result = f"User denied dangerous command: {reason}"
                                emit(
                                    tool_call_event(
                                        session, guard, call_id=tc.id, name=name,
                                        status="completed", args=args_obj, result=result,
                                        include_empty=True,
                                    )
                                )
                                messages.append({
                                    "role": "tool",
                                    "tool_call_id": tc.id,
                                    "content": result,
                                })
                                continue
                    path_arg = ""
                    if isinstance(args_obj, dict):
                        path_arg = str(args_obj.get("path") or args_obj.get("file") or "").strip()
                    if path_arg and name in {"write_file", "str_replace"} and parent_tracker is not None:
                        parent_tracker.snapshot_before(path_arg)
                    result = await asyncio.to_thread(run_tool, executors, name, raw_args)
                    if (
                        parent_tracker is not None
                        and path_arg
                        and name in {"write_file", "str_replace"}
                        and isinstance(result, str)
                        and result.startswith(("wrote ", "updated "))
                    ):
                        parent_tracker.mark_touched(path_arg)
                emit(
                    tool_call_event(
                        session, guard, call_id=tc.id, name=name, status="completed",
                        args=args_obj, result=result, include_empty=True,
                    )
                )
            messages.append({
                "role": "tool",
                "tool_call_id": tc.id,
                "content": result if isinstance(result, str) else json.dumps(result, ensure_ascii=False),
            })
    if not final_text:
        tool_bits = [
            m.get("content", "")
            for m in messages
            if m.get("role") == "tool" and isinstance(m.get("content"), str)
        ]
        final_text = "\n".join(tool_bits[-4:])[:4000] or f"({kind} produced no findings)"
    return final_text[:6000]


async def _run_explore(
    client: AsyncOpenAI,
    *,
    model: str,
    settings: dict,
    query: str,
    session,
    turn: int,
    emit: Callable[[dict], None],
    provider: str,
) -> str:
    """Back-compat alias → read-only subagent at depth 1."""
    return await _run_subagent(
        client,
        model=model,
        settings=settings,
        prompt=query,
        session=session,
        turn=turn,
        emit=emit,
        provider=provider,
        subagent_type="explore",
        depth=1,
    )


async def stream_compat_turn(
    session,
    settings: dict,
    *,
    message: str,
    mode: str,
    attachments: list[dict] | None,
    turn: int,
    emit: Callable[[dict], None],
    thinking: bool | None = None,
    reasoning_effort: str | None = None,
) -> str:
    """One agent turn: stream tokens, run tools, emit widget SSE. Returns done status."""
    handle: CompatSessionAgent = session.agent
    model = session.model or default_model(handle.provider)
    allow_write = bool(settings.get("allow_repo_write", True)) and mode != "plan"
    # Same effective flag for tool_call_event pre-checks (plan mode must block shell writes).
    guard_settings = {**settings, "allow_repo_write": allow_write}
    from backend.ssh_workspace import is_ssh_uri

    if is_ssh_uri(str(settings.get("host_root") or "")):
        tracker = None
    else:
        tracker = TurnChangeTracker(Path(settings["host_root"]))
    tools, executors = make_tool_kit(settings, allow_write=allow_write, tracker=tracker)
    mcp_mgr = None
    try:
        from backend.mcp_client import get_mcp_manager

        mcp_mgr = get_mcp_manager(settings)
        mcp_tools = mcp_mgr.openai_tools()
        if mcp_tools:
            tools = list(tools) + mcp_tools
    except Exception:
        mcp_mgr = None
    client = build_client(settings, handle.provider)
    # DeepSeek default: thinking off. Others ignore.
    use_thinking = False if thinking is None else bool(thinking)
    if handle.provider != "deepseek":
        use_thinking = False

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

    # New user turn: drop prior reasoning that had no tools (API ignores it).
    strip_unused_reasoning(handle.messages)
    handle.messages.append({"role": "user", "content": user_text})
    final_status = "finished"
    emitted_text_len = 0
    tools_ran = False
    nudged_for_empty = False

    try:
        for _ in range(_MAX_ROUNDS):
            if session.turn != turn:
                return "cancelled"

            # Accumulate one completion (stream text to UI; buffer tool_calls).
            content_parts: list[str] = []
            tool_acc: dict[int, dict[str, str]] = {}
            finish_reason = None
            thinking_parts: list[str] = []

            trim_history(handle.messages)
            request: dict[str, Any] = {
                "model": model,
                "messages": handle.messages,
                "tools": None if nudged_for_empty else (tools or None),
                "stream": True,
            }
            if handle.provider == "deepseek":
                # Keep reasoning_content on tool-call assistants or next round → 400.
                apply_deepseek_thinking(
                    request,
                    thinking=use_thinking,
                    reasoning_effort=reasoning_effort,
                )
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
                    emitted_text_len += len(delta.content)
                    emit({
                        "type": "text",
                        "session_id": session.session_id,
                        "content": delta.content,
                        "model": session.model,
                    })
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

            assistant_msg: dict[str, Any] = {
                "role": "assistant",
                "content": "".join(content_parts) or None,
            }
            if thinking_parts:
                assistant_msg["reasoning_content"] = "".join(thinking_parts)
            # ponytail: no mid-round thinking.completed — UI soft-pauses on tool_call;
            # Cursor SDK still sends thinking-completed for its own bursts.
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
                # Tools ran earlier but model returned empty final text → nudge once.
                if (
                    tools_ran
                    and not "".join(content_parts).strip()
                    and not nudged_for_empty
                    and emitted_text_len == 0
                ):
                    nudged_for_empty = True
                    handle.messages.append({
                        "role": "user",
                        "content": "请根据上面的工具结果，用简短中文直接回答用户。不要再调用工具。",
                    })
                    continue
                break

            tools_ran = True
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
                    guard_settings,
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
                    emitted_text_len += len(str(ev["repo_write_blocked"] or ""))
                    result = ev["repo_write_blocked"]
                    blocked_turn = True
                elif name == "explore":
                    query = ""
                    if isinstance(args_obj, dict):
                        query = str(args_obj.get("query") or args_obj.get("prompt") or "").strip()
                    result = await _run_subagent(
                        client,
                        model=model,
                        settings=guard_settings,
                        prompt=query,
                        session=session,
                        turn=turn,
                        emit=emit,
                        provider=handle.provider,
                        subagent_type="explore",
                        depth=1,
                    )
                elif name == "task":
                    child_prompt = ""
                    child_type = "explore"
                    if isinstance(args_obj, dict):
                        child_prompt = str(args_obj.get("prompt") or args_obj.get("query") or "").strip()
                        child_type = str(args_obj.get("subagent_type") or "explore").strip().lower()
                    result = await _run_subagent(
                        client,
                        model=model,
                        settings=guard_settings,
                        prompt=child_prompt,
                        session=session,
                        turn=turn,
                        emit=emit,
                        provider=handle.provider,
                        subagent_type=child_type,
                        depth=1,
                        parent_tracker=tracker if child_type == "general" else None,
                    )
                elif str(name).startswith("mcp__") and mcp_mgr is not None:
                    result = await asyncio.to_thread(mcp_mgr.call, name, args_obj)
                else:
                    # Dangerous shell → UI confirm before executing.
                    if name == "run_shell" and isinstance(args_obj, dict):
                        from backend.safety import shell_approval_reason

                        cmd = str(args_obj.get("command") or "")
                        reason = shell_approval_reason(cmd)
                        if reason:
                            ok = await _await_shell_approval(
                                session,
                                call_id=call_id,
                                command=cmd,
                                reason=reason,
                                turn=turn,
                                emit=emit,
                            )
                            if session.turn != turn:
                                return "cancelled"
                            if not ok:
                                result = f"User denied dangerous command: {reason}"
                                emit(
                                    tool_call_event(
                                        session,
                                        guard_settings,
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
                                    "content": result,
                                })
                                continue
                    # Snapshot before I/O even if the tool rejects kwargs — so undo
                    # still works when the model used contents/fileText aliases.
                    path_arg = ""
                    if isinstance(args_obj, dict):
                        path_arg = str(args_obj.get("path") or args_obj.get("file") or "").strip()
                    if path_arg and name in {"write_file", "str_replace"} and tracker is not None:
                        tracker.snapshot_before(path_arg)
                    result = await asyncio.to_thread(run_tool, executors, name, raw_args)
                    if (
                        tracker is not None
                        and path_arg
                        and name in {"write_file", "str_replace"}
                        and isinstance(result, str)
                        and result.startswith(("wrote ", "updated "))
                    ):
                        tracker.mark_touched(path_arg)

                emit(
                    tool_call_event(
                        session,
                        guard_settings,
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
            emitted_text_len += 1

        # Never finish with a blank bubble: synthesize if model stayed silent.
        if final_status == "finished" and emitted_text_len == 0 and session.turn == turn:
            bits: list[str] = []
            for msg in reversed(handle.messages):
                if msg.get("role") != "tool":
                    continue
                body = msg.get("content")
                if isinstance(body, str) and body.strip():
                    bits.append(body.strip()[:1200])
                if len(bits) >= 3:
                    break
            if bits:
                summary = "根据工具结果：\n\n" + "\n\n---\n\n".join(reversed(bits))
            else:
                summary = "（模型未返回内容。请重试，或换个说法再问一次。）"
            emit({
                "type": "text",
                "session_id": session.session_id,
                "content": summary,
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

    # Emit workspace change summary for this turn (undoable when files changed).
    if tracker is not None:
        summary = tracker.summary()
        if summary.get("file_count"):
            store_tracker(session, tracker)
            emit({
                **summary,
                "session_id": session.session_id,
                "model": session.model,
            })

    return final_status


if __name__ == "__main__":
    assert normalize_reasoning_effort("low") == "high"
    assert normalize_reasoning_effort("xhigh") == "max"
    assert normalize_reasoning_effort(None) is None
    assert normalize_reasoning_effort("") is None
    msgs = [
        {"role": "assistant", "content": "ok", "reasoning_content": "drop me"},
        {
            "role": "assistant",
            "content": None,
            "reasoning_content": "keep me",
            "tool_calls": [{"id": "c1", "type": "function", "function": {"name": "x", "arguments": "{}"}}],
        },
    ]
    strip_unused_reasoning(msgs)
    assert "reasoning_content" not in msgs[0]
    assert msgs[1]["reasoning_content"] == "keep me"
    req: dict = {}
    apply_deepseek_thinking(req, thinking=True)  # omit effort → API default
    assert "reasoning_effort" not in req
    assert req["extra_body"] == {"thinking": {"type": "enabled"}}
    req_hi: dict = {}
    apply_deepseek_thinking(req_hi, thinking=True, reasoning_effort="high")
    assert req_hi["reasoning_effort"] == "high"
    req2: dict = {}
    apply_deepseek_thinking(req2, thinking=False)
    assert "reasoning_effort" not in req2
    assert req2["extra_body"] == {"thinking": {"type": "disabled"}}
    hist = [{"role": "system", "content": "s"}] + [
        {"role": "user", "content": str(i)} for i in range(50)
    ]
    trim_history(hist, max_messages=5)
    assert hist[0]["role"] == "system"
    assert any("Earlier conversation summary" in str(m.get("content") or "") for m in hist)
    assert hist[-1]["content"] == "49"
    ssh_block = _workspace_env_block({"host_root": "ssh://demo-host/home/wxj/proj"})
    assert "REMOTE" in ssh_block and "ssh://demo-host" in ssh_block, ssh_block
    assert "NOT Windows" in ssh_block or "POSIX" in ssh_block, ssh_block
    print("ok")
