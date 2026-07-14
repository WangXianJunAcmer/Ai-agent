"""SDK tool-call parsing and Cursor-like UI summaries / SSE event shaping."""

from __future__ import annotations

import json
import re
from typing import AsyncIterator
from urllib.parse import urlparse

from backend.model_catalog import model_display_name, normalize_model_id
from backend.repo_write_guard import normalize_tool_name, repo_write_block_reason
from backend.safety import sensitive_tool_block_reason


def stringify(value) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    try:
        return json.dumps(value, ensure_ascii=False, indent=2)
    except Exception:
        return str(value)


def jsonable(value):
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, dict):
        return {str(k): jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [jsonable(item) for item in value]
    try:
        json.dumps(value)
        return value
    except Exception:
        return str(value)


def collect_paths(value) -> list[str]:
    paths: list[str] = []

    def visit(item) -> None:
        if isinstance(item, dict):
            for key, nested in item.items():
                lowered = str(key).lower()
                if lowered in {
                    "path", "paths", "file", "files", "target_file", "target_notebook",
                    "working_directory", "cwd", "glob_pattern", "pattern",
                }:
                    if isinstance(nested, str):
                        paths.append(nested)
                    elif isinstance(nested, (list, tuple)):
                        for entry in nested:
                            if isinstance(entry, str):
                                paths.append(entry)
                visit(nested)
        elif isinstance(item, (list, tuple)):
            for nested in item:
                visit(nested)

    visit(value)
    seen = set()
    result = []
    for path in paths:
        if path and path not in seen:
            seen.add(path)
            result.append(path)
    return result[:6]


def first_str(value, *keys) -> str:
    if not isinstance(value, dict):
        return ""
    for key in keys:
        nested = value.get(key)
        if isinstance(nested, str) and nested.strip():
            return nested.strip()
    return ""


def unwrap_tool_payload(value):
    """SDK puts tool info under update.tool_call, often as {readToolCall: {...}} or {type, args}."""
    if not isinstance(value, dict) or not value:
        return value
    if any(k in value for k in ("name", "toolName", "tool_name", "type", "args", "arguments", "input", "result", "output")):
        return value
    if len(value) == 1:
        key, only = next(iter(value.items()))
        if isinstance(only, dict):
            if "type" not in only and str(key).endswith("ToolCall"):
                tool_type = str(key)[: -len("ToolCall")]
                if tool_type:
                    only = {**only, "type": tool_type[0].lower() + tool_type[1:]}
            return only
    for key, nested in value.items():
        if isinstance(nested, dict) and key.lower().endswith(("toolcall", "tool_call", "call")):
            return nested
    return value


def tool_name_from_payload(tool_call, payload) -> str:
    for source in (tool_call, payload):
        if not isinstance(source, dict):
            continue
        for key in ("type", "name", "toolName", "tool_name", "tool", "functionName", "function_name"):
            val = source.get(key)
            if isinstance(val, str) and val.strip():
                return val.strip()
            if isinstance(val, dict):
                nested = val.get("name") or val.get("toolName") or val.get("tool_name")
                if isinstance(nested, str) and nested.strip():
                    return nested.strip()
    if isinstance(tool_call, dict):
        for key in tool_call:
            lowered = str(key)
            if lowered.endswith("ToolCall"):
                stem = lowered[: -len("ToolCall")]
                return stem[0].lower() + stem[1:] if stem else "tool"
            if lowered.endswith("_tool_call"):
                return lowered[: -len("_tool_call")]
            if lowered.endswith("Tool"):
                stem = lowered[: -len("Tool")]
                return stem[0].lower() + stem[1:] if stem else "tool"
    return "tool"


def tool_args_from_payload(payload):
    if not isinstance(payload, dict):
        return payload
    for key in ("args", "arguments", "input", "params", "parameters"):
        if key in payload and payload[key] is not None:
            return payload[key]
    keep = {}
    for key in (
        "command", "cmd", "path", "paths", "file", "files", "target_file",
        "glob_pattern", "pattern", "query", "search_term", "url", "description",
        "working_directory", "cwd", "old_string", "new_string", "patch",
    ):
        if key in payload:
            keep[key] = payload[key]
    return keep or payload


def tool_result_from_payload(payload):
    if not isinstance(payload, dict):
        return payload
    for key in ("result", "output", "response", "content", "stdout"):
        if key in payload and payload[key] is not None:
            return payload[key]
    return None


def extract_tool_fields(update) -> tuple[str, object, object]:
    tool_call = getattr(update, "tool_call", None)
    if tool_call is None and isinstance(update, dict):
        tool_call = update.get("tool_call") or update.get("toolCall")
    if not isinstance(tool_call, dict):
        tool_call = {}
    payload = unwrap_tool_payload(tool_call)
    name = tool_name_from_payload(tool_call, payload if isinstance(payload, dict) else {})
    if name == "tool":
        legacy = getattr(update, "name", None)
        if isinstance(legacy, str) and legacy.strip():
            name = legacy.strip()
    args = tool_args_from_payload(payload if isinstance(payload, dict) else {})
    if args in (None, {}, "") and getattr(update, "args", None) is not None:
        args = getattr(update, "args")
    result = tool_result_from_payload(payload if isinstance(payload, dict) else {})
    if result is None and getattr(update, "result", None) is not None:
        result = getattr(update, "result")
    return name, args, result


def shell_command_raw(args) -> str:
    if isinstance(args, str):
        text = args.strip()
        if text.startswith("{") and text.endswith("}"):
            try:
                parsed = json.loads(text)
                if isinstance(parsed, dict):
                    args = parsed
                else:
                    return text
            except json.JSONDecodeError:
                return text
        else:
            return text
    if not isinstance(args, dict):
        return ""
    for key in ("command", "cmd", "script", "code", "input"):
        value = args.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def command_preview(args) -> str:
    """Whitespace-collapsed, truncated shell command for card titles."""
    cmd = " ".join(shell_command_raw(args).split())
    return (cmd[:120] + "…") if len(cmd) > 120 else cmd


def shell_title(cmd: str, status: str, description: str = "") -> str:
    """Cursor-like: Running while live, Ran when done; full command in detail."""
    desc = (description or "").strip()
    if desc:
        return desc[:80]
    return "Running" if status == "running" else "Ran"


def shell_looks_like_explore(cmd: str) -> bool:
    head = (cmd or "").strip().lstrip("sudo ").split("\n", 1)[0].strip()
    return bool(
        re.match(
            r"^(ls|ll|find|cat|head|tail|rg|grep|egrep|fgrep|git\s+(status|log|diff|show|branch|remote)|"
            r"wc|file|stat|tree|pwd|which|type|echo|realpath|readlink|basename|dirname)\b",
            head,
            re.I,
        )
    )


def is_network_command(cmd: str) -> bool:
    if not cmd:
        return False
    return bool(re.search(r"\b(curl|wget|http://|https://)\b", cmd, re.I))


def extract_patch_targets(text: str) -> list[str]:
    if not text:
        return []
    matches = re.findall(r"\*\*\* (?:Add|Update) File: (.+)", text)
    return matches[:6]


def extract_patch_preview(text: str) -> list[dict]:
    if not text:
        return []
    previews: list[dict] = []
    current_path = ""
    removed: list[str] = []
    added: list[str] = []
    for line in text.splitlines():
        if line.startswith("*** Add File: ") or line.startswith("*** Update File: "):
            if current_path and (removed or added):
                previews.append({"path": current_path, "removed": removed[:3], "added": added[:3]})
            current_path = line.split(": ", 1)[1].strip()
            removed = []
            added = []
        elif line.startswith("-") and not line.startswith("---"):
            removed.append(line[1:])
        elif line.startswith("+") and not line.startswith("+++"):
            added.append(line[1:])
    if current_path and (removed or added):
        previews.append({"path": current_path, "removed": removed[:3], "added": added[:3]})
    return previews[:3]


def tool_summary(name: str, args=None, result=None, status: str = "unknown") -> dict:
    raw_name = (name or "tool").strip() or "tool"
    lowered = normalize_tool_name(raw_name)
    paths = collect_paths(args) or collect_paths(result)
    cmd = command_preview(args)
    query = ""
    if isinstance(args, dict):
        query = first_str(args, "query", "search_term", "pattern", "glob_pattern", "url", "description")
    patch_text = ""
    if isinstance(args, str):
        patch_text = args
    elif isinstance(args, dict):
        for key in ("patch", "old_string", "new_string"):
            if isinstance(args.get(key), str) and "*** " in args.get(key, ""):
                patch_text = args[key]
                break
    patch_paths = extract_patch_targets(patch_text)
    if patch_paths:
        paths = patch_paths
    patch_preview = extract_patch_preview(patch_text)
    path_detail = ", ".join(paths) if paths else ""
    detail = path_detail or query or cmd or raw_name

    if lowered == "tool" and cmd:
        desc = first_str(args, "description") if isinstance(args, dict) else ""
        if shell_looks_like_explore(cmd):
            return {
                "kind": "explore",
                # Cursor shell cards: Running / Ran — command lives in detail.
                "title": shell_title(cmd, status, desc),
                "detail": shell_command_raw(args) or cmd,
                "paths": paths,
            }
        return {
            "kind": "run",
            "title": shell_title(cmd, status, desc),
            "detail": cmd,
            "paths": paths,
        }
    if lowered in {"read", "readfile", "readfiles", "cat"}:
        return {
            "kind": "explore",
            "title": f"Read {paths[0] if paths else 'file'}",
            "detail": detail,
            "paths": paths,
        }
    if lowered in {"glob", "find", "ls", "listdir", "list_dir", "list"}:
        return {
            "kind": "explore",
            "title": f"Listed {query or (paths[0] if paths else 'files')}",
            "detail": detail,
            "paths": paths,
        }
    if lowered in {"rg", "grep", "search", "ripgrep"}:
        return {
            "kind": "explore",
            "title": f"Grepped {query or 'workspace'}",
            "detail": detail,
            "paths": paths,
        }
    if lowered == "websearch":
        term = query or (first_str(args, "search_term", "q") if isinstance(args, dict) else "")
        label = (term or "web")[:80]
        return {
            "kind": "explore",
            "title": ("Searching " if status == "running" else "Searched ") + label,
            "detail": detail,
            "paths": paths,
        }
    if lowered == "webfetch":
        url = query or (first_str(args, "url") if isinstance(args, dict) else "")
        host = url
        if url:
            try:
                host = urlparse(url).netloc or url
            except Exception:
                host = url
        label = (host or "page")[:80]
        return {
            "kind": "explore",
            "title": ("Fetching " if status == "running" else "Fetched ") + label,
            "detail": detail or url,
            "paths": paths,
        }
    if lowered in {"semsearch", "semanticsearch"}:
        return {
            "kind": "explore",
            "title": f"Searched {query or 'workspace'}",
            "detail": detail,
            "paths": paths,
        }
    if lowered in {"applypatch", "editnotebook", "strreplace", "edit", "searchreplace"}:
        return {
            "kind": "edit",
            "title": ("Editing " if status == "running" else "Edited ") + (paths[0] if paths else "code"),
            "detail": detail,
            "paths": paths,
            "diff": patch_preview,
        }
    if lowered in {"write"}:
        return {
            "kind": "edit",
            "title": ("Writing " if status == "running" else "Wrote ") + (paths[0] if paths else "file"),
            "detail": detail,
            "paths": paths,
        }
    if lowered in {"delete"}:
        return {
            "kind": "edit",
            "title": ("Deleting " if status == "running" else "Deleted ") + (paths[0] if paths else "file"),
            "detail": detail,
            "paths": paths,
        }
    if lowered in {"todowrite", "todo", "updatetodos"}:
        return {"kind": "plan", "title": "Updated todos", "detail": detail or "Refreshed task list", "paths": []}
    if lowered in {"createplan"}:
        return {"kind": "plan", "title": "Created plan", "detail": detail or "Plan draft", "paths": []}
    if lowered in {"task"}:
        task_desc = query or (
            first_str(args, "prompt", "description", "message") if isinstance(args, dict) else ""
        )
        return {
            "kind": "plan",
            "title": "Task" + (f": {task_desc[:80]}" if task_desc else ""),
            "detail": detail or task_desc,
            "paths": [],
        }
    if lowered in {"mcp"}:
        mcp_tool = first_str(args, "toolName", "tool_name", "name", "tool") if isinstance(args, dict) else ""
        return {
            "kind": "tool",
            "title": f"Called {mcp_tool or 'MCP tool'}",
            "detail": detail,
            "paths": paths,
        }
    if lowered in {"generateimage"}:
        return {"kind": "tool", "title": "Generated image", "detail": detail, "paths": paths}
    if lowered in {"recordscreen"}:
        return {"kind": "run", "title": "Recorded screen", "detail": detail, "paths": paths}
    if lowered in {"readlints", "lint", "diagnostics"}:
        return {"kind": "verify", "title": "Read lints", "detail": detail, "paths": paths}
    if lowered in {"shell", "awaitshell", "bash", "terminal", "runterminalcmd", "runterminal"}:
        desc = first_str(args, "description") if isinstance(args, dict) else ""
        full_cmd = shell_command_raw(args) or cmd
        shell_detail = full_cmd or detail
        if is_network_command(cmd):
            return {
                "kind": "explore",
                "title": ("Fetching " if status == "running" else "Fetched ") + "web",
                "detail": shell_detail,
                "paths": paths,
            }
        if shell_looks_like_explore(full_cmd or cmd):
            return {
                "kind": "explore",
                "title": shell_title(full_cmd or cmd, status, desc),
                "detail": shell_detail,
                "paths": paths,
            }
        return {
            "kind": "run",
            "title": shell_title(full_cmd or cmd, status, desc),
            "detail": shell_detail,
            "paths": paths,
        }
    return {
        "kind": "tool",
        "title": (
            shell_title(cmd or detail or raw_name or "command", status)
            if raw_name == "tool"
            else (("Running " if status == "running" else "Ran ") + raw_name)
        ),
        "detail": detail if detail != raw_name else stringify(args)[:200],
        "paths": paths,
    }


def friendly_error(message: str) -> str:
    msg = (message or "").strip() or "unknown"
    lower = msg.lower()
    if (
        ("context" in lower and any(k in lower for k in ("limit", "length", "window", "overflow", "exceed", "too long")))
        or "maximum context" in lower
        or "prompt is too long" in lower
        or ("token" in lower and "limit" in lower)
        or ("上下文" in msg and ("超" in msg or "过长" in msg))
    ):
        return "上下文已超限，请点击「新对话」清空后重试，或缩短本次输入/附件。原始错误: " + msg
    if "agent_busy" in lower or "agent is busy" in lower or ("busy" in lower and "agent" in lower):
        return "上一条仍在执行，请稍等片刻后重试，或点击「新对话」。原始错误: " + msg
    if lower == "internal error" or "internal error" in lower:
        return "服务内部错误，常见于上一条被中断后 Agent 尚未释放。请再发一次或开新对话。原始错误: " + msg
    return msg


def model_id_from_selection(value) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        mid = value.strip()
    elif isinstance(value, dict):
        mid = str(value.get("id") or "").strip()
    else:
        mid = str(getattr(value, "id", "") or "").strip()
    return normalize_model_id(mid)


def resolved_model_payload(resolved_id: str) -> dict:
    rid = (resolved_id or "").strip()
    if not rid or rid in {"auto", "default"}:
        return {}
    return {
        "resolved_model": rid,
        "resolved_model_label": model_display_name(rid) or rid,
    }


def tool_call_event(
    session,
    settings: dict,
    *,
    call_id: str,
    name: str,
    status: str,
    args,
    result,
    include_empty: bool = False,
    check_repo_write: bool = False,
) -> dict:
    raw = (status or "running").strip().lower()
    status = "completed" if raw in {"completed", "error", "failed", "cancelled", "canceled"} else "running"
    summary = tool_summary(name, args, result, status)
    event = {
        "type": "tool_call",
        "session_id": session.session_id,
        "model": session.model,
        "call_id": call_id or "",
        "name": name,
        "status": status,
        "args": stringify(args) if (include_empty or status == "running") else "",
        "result": stringify(result) if (include_empty or status == "completed") else "",
        "summary": summary,
        "args_json": jsonable(args),
    }
    if include_empty or status == "completed":
        event["result_json"] = jsonable(result)
    if check_repo_write and status == "running":
        block = repo_write_block_reason(settings, name, args) or sensitive_tool_block_reason(
            name, args
        )
        if block:
            event["repo_write_blocked"] = block
    return event


def _session_event(session, type_: str, **extra) -> dict:
    return {
        "type": type_,
        "session_id": session.session_id,
        "model": session.model,
        **extra,
    }


def assistant_text_from_message(message) -> str:
    """SDKAssistantMessage.message.content → joined text blocks."""
    content = getattr(getattr(message, "message", None), "content", None) or ()
    parts: list[str] = []
    for block in content:
        if getattr(block, "type", None) == "text":
            text = getattr(block, "text", None)
            if text:
                parts.append(str(text))
        elif isinstance(block, dict) and block.get("type") == "text" and block.get("text"):
            parts.append(str(block["text"]))
    return "".join(parts)


def sse_from_delta(update, session, settings: dict) -> dict | None:
    """Map Cursor InteractionUpdate → widget SSE. Types must match cursor_sdk.types."""
    update_type = getattr(update, "type", None)
    if update_type == "summary-started":
        return _session_event(session, "planning", content="")
    # Official type is "summary" (SummaryUpdate.summary). Keep legacy alias.
    if update_type in {"summary", "summary-update"}:
        content = (
            getattr(update, "summary", None)
            or getattr(update, "text", None)
            or ""
        )
        return _session_event(session, "planning", content=content)
    if update_type == "thinking-delta":
        return _session_event(session, "thinking", content=getattr(update, "text", "") or "")
    if update_type == "thinking-completed":
        return _session_event(
            session,
            "thinking",
            content="",
            completed=True,
            thinking_duration_ms=getattr(update, "thinking_duration_ms", None),
        )
    if update_type in {"tool-call-started", "partial-tool-call", "tool-call-completed"}:
        name, args, result = extract_tool_fields(update)
        status = "completed" if update_type == "tool-call-completed" else "running"
        return tool_call_event(
            session,
            settings,
            call_id=getattr(update, "call_id", "") or "",
            name=name,
            status=status,
            args=args,
            result=result,
            check_repo_write=update_type != "tool-call-completed",
        )
    if update_type == "text-delta":
        return _session_event(session, "text", content=getattr(update, "text", "") or "")
    return None


def dedupe_cumulative(so_far: str, snapshot: str) -> tuple[str, str]:
    """If snapshot is a cumulative prefix extension of so_far, emit only the suffix."""
    if not snapshot:
        return so_far, ""
    if snapshot == so_far:
        return so_far, ""
    if so_far and snapshot.startswith(so_far):
        return snapshot, snapshot[len(so_far) :]
    if so_far and so_far.startswith(snapshot):
        return so_far, ""
    # Unrelated snapshot (no prior deltas) — emit whole text once.
    if not so_far:
        return snapshot, snapshot
    return so_far, ""


async def sse_from_run_messages(run, session, settings: dict) -> AsyncIterator[dict]:
    async for message in run.messages():
        msg_type = getattr(message, "type", None)
        if msg_type == "system":
            resolved = model_id_from_selection(getattr(message, "model", None))
            payload = resolved_model_payload(resolved)
            if payload:
                yield {
                    "type": "model_resolved",
                    "session_id": session.session_id,
                    "model": session.model,
                    **payload,
                }
        elif msg_type == "assistant":
            # Fallback when a model skips text-delta and only emits SDK assistant
            # messages (observed with some Grok runs). Mark cumulative for pump dedupe.
            text = assistant_text_from_message(message)
            if text:
                yield _session_event(session, "text", content=text, cumulative=True)
        elif msg_type == "thinking":
            text = getattr(message, "text", "") or ""
            if text:
                yield _session_event(session, "thinking", content=text, cumulative=True)
            yield _session_event(
                session,
                "thinking",
                content="",
                completed=True,
                thinking_duration_ms=getattr(message, "thinking_duration_ms", None),
            )
        elif msg_type == "status":
            yield {
                "type": "status",
                "session_id": session.session_id,
                "model": session.model,
                "status": getattr(message, "status", "unknown"),
                "content": getattr(message, "message", "") or getattr(message, "status", ""),
            }
        elif msg_type == "task":
            yield {
                "type": "task",
                "session_id": session.session_id,
                "model": session.model,
                "status": getattr(message, "status", "unknown"),
                "content": getattr(message, "text", ""),
            }
        elif msg_type == "tool_call":
            name = getattr(message, "name", None) or "tool"
            status = getattr(message, "status", "running") or "running"
            yield tool_call_event(
                session,
                settings,
                call_id=getattr(message, "call_id", "") or "",
                name=name,
                status=status,
                args=getattr(message, "args", None),
                result=getattr(message, "result", None),
                include_empty=True,
                check_repo_write=status != "completed",
            )
