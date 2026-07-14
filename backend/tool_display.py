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
        "contents", "content", "text", "file_text", "fileText",
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


def _result_value(result) -> dict:
    """Cursor SDK nests success fields under result.value."""
    if not isinstance(result, dict):
        return {}
    value = result.get("value")
    return value if isinstance(value, dict) else result


def _result_line_counts(result) -> tuple[int | None, int | None]:
    """Prefer SDK-provided line counts (edit: linesAdded/Removed; write: linesCreated)."""
    val = _result_value(result)
    if not val:
        return None, None
    added = val.get("linesAdded")
    removed = val.get("linesRemoved")
    created = val.get("linesCreated")
    if isinstance(added, int) or isinstance(removed, int):
        return (added if isinstance(added, int) else 0), (removed if isinstance(removed, int) else 0)
    if isinstance(created, int):
        return created, 0
    return None, None


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
    # Cursor SDK often names updates deleteToolCall / writeToolCall.
    if lowered.endswith("toolcall") and len(lowered) > len("toolcall"):
        lowered = lowered[: -len("toolcall")]
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
        # Prefer old/new string preview when no patch format.
        # Count by lines (Codex), not one blob = +1/-1.
        diff = patch_preview
        if not diff and isinstance(args, dict):
            old_s = args.get("old_string")
            new_s = args.get("new_string")
            if isinstance(old_s, str) or isinstance(new_s, str):
                removed = (old_s or "").splitlines() if isinstance(old_s, str) else []
                added = (new_s or "").splitlines() if isinstance(new_s, str) else []
                diff = [{"path": paths[0] if paths else "", "removed": removed, "added": added}]
        out = {
            "kind": "edit",
            "title": ("Editing " if status == "running" else "Edited ") + (paths[0] if paths else "code"),
            # Path lives in the title only — body is diff (Codex).
            "detail": "",
            "paths": paths,
            "diff": diff,
            "status": "modified",
        }
        if diff:
            out["additions"] = sum(len(d.get("added") or []) for d in diff)
            out["deletions"] = sum(len(d.get("removed") or []) for d in diff)
        # Cursor EditSuccess: authoritative line counts on completed.
        sdk_add, sdk_del = _result_line_counts(result)
        if sdk_add is not None:
            out["additions"] = sdk_add
            out["deletions"] = sdk_del if sdk_del is not None else 0
        return out
    if lowered in {"write", "writefile"}:
        content = ""
        if isinstance(args, dict):
            # Cursor SDK uses fileText; compat tools use contents.
            for key in ("fileText", "file_text", "contents", "content", "text", "new_string"):
                if isinstance(args.get(key), str):
                    content = args[key]
                    break
        if not content:
            content = str(_result_value(result).get("fileContentAfterWrite") or "")
        added = content.splitlines() if content else []
        out = {
            "kind": "edit",
            "title": ("Writing " if status == "running" else "Wrote ") + (paths[0] if paths else "file"),
            "detail": "",
            "paths": paths,
            "status": "created",
        }
        if added:
            out["diff"] = [{"path": paths[0] if paths else "", "removed": [], "added": added[:80]}]
            out["additions"] = len(added)
            out["deletions"] = 0
        # Cursor WriteSuccess.linesCreated — count at edit completion, not later.
        sdk_add, sdk_del = _result_line_counts(result)
        if sdk_add is not None:
            out["additions"] = sdk_add
            out["deletions"] = sdk_del if sdk_del is not None else 0
            if not out.get("diff") and content:
                out["diff"] = [{"path": paths[0] if paths else "", "removed": [], "added": content.splitlines()[:80]}]
        return out
    if lowered in {"delete", "deletefile"}:
        return {
            "kind": "edit",
            "title": ("Deleting " if status == "running" else "Deleted ") + (paths[0] if paths else "file"),
            "detail": "",
            "paths": paths,
            "status": "deleted",
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
        # Paths render as pills — don't also put them in detail (plain + pill echo).
        return {"kind": "verify", "title": "Read lints", "detail": "", "paths": paths}
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


def is_gpt_family(model_id: str | None) -> bool:
    """Cursor GPT / OpenAI-family model ids (probe labeling; not a seal special-case)."""
    mid = (model_id or "").strip().lower()
    if not mid or mid in {"auto", "default"}:
        return False
    if "gpt" in mid or "chatgpt" in mid:
        return True
    # o1 / o3 / o4-mini …
    if mid[0] == "o" and len(mid) > 1 and mid[1].isdigit():
        return True
    return False


def session_is_gpt_family(session) -> bool:
    for raw in (
        getattr(session, "resolved_model", None),
        getattr(session, "model_selection", None),
        getattr(session, "model", None),
    ):
        if is_gpt_family(model_id_from_selection(raw)):
            return True
    return False


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
    title = str(summary.get("title") or "")
    is_edit = summary.get("kind") == "edit" or title.startswith(
        ("Deleting ", "Deleted ", "Editing ", "Edited ", "Writing ", "Wrote ")
    )
    # Snapshot edit counts BEFORE warming cache — completed writes already
    # sit on disk; warming first would poison "before" with after-content.
    if is_edit:
        if summary.get("kind") != "edit":
            summary["kind"] = "edit"
        _attach_file_change_preview(
            session, settings, summary, args=args, result=result, call_id=call_id or "", status=status
        )
    # Cache file text while it still exists (Read/Explore/…); Delete often
    # arrives after the file is gone — counting then yields +0/-0.
    _warm_file_text_cache(session, settings, summary)
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


_MAX_EDIT_PREVIEW_LINES = 80
_EDIT_SNAPSHOT_BYTES = 2_000_000
_TITLE_PATH_PREFIXES = (
    "Deleting ", "Deleted ", "Editing ", "Edited ",
    "Writing ", "Wrote ", "Reading ", "Read ",
)


def _paths_from_summary(summary: dict) -> list[str]:
    paths = list(summary.get("paths") or [])
    if paths:
        return paths
    title = str(summary.get("title") or "")
    for prefix in _TITLE_PATH_PREFIXES:
        if title.startswith(prefix):
            rest = title[len(prefix):].strip()
            if rest and rest not in {"file", "code", "files"}:
                summary["paths"] = [rest]
                return [rest]
    return []


def _resolve_host_file(root: str, path: str):
    from pathlib import Path

    rel = str(path or "").replace("\\", "/").lstrip("./")
    if not rel:
        return None, ""
    candidate = Path(rel)
    abs_path = candidate if candidate.is_absolute() else (Path(root) / rel)
    try:
        abs_path = abs_path.resolve()
        root_r = Path(root).resolve()
        rel = str(abs_path.relative_to(root_r)).replace("\\", "/")
    except (OSError, ValueError):
        return None, rel
    return abs_path, rel


def _read_host_text(abs_path) -> str | None:
    snap = _read_host_snapshot(abs_path)
    return snap if isinstance(snap, str) else None


def _read_host_snapshot(abs_path):
    """Return UTF-8 str, raw bytes (binary), or None if missing/too large."""
    if abs_path is None or not abs_path.is_file():
        return None
    try:
        data = abs_path.read_bytes()
    except OSError:
        return None
    if len(data) > _EDIT_SNAPSHOT_BYTES:
        return None
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        return data


def _apply_opaque_delete_counts(summary: dict, rel: str, size: int) -> None:
    """Binary / unreadable delete: no line diff, count as 1 removed unit."""
    # ponytail: binary has no lines; -1 marks the file so totals aren't +0/-0.
    summary["status"] = "deleted"
    summary["additions"] = 0
    summary["deletions"] = 1
    summary["diff"] = [{
        "path": rel,
        "removed": [f"(binary, {max(0, int(size))} bytes)"],
        "added": [],
    }]


def _file_text_cache(session) -> dict:
    cache = getattr(session, "_file_text_cache", None)
    if cache is None:
        session._file_text_cache = {}
        cache = session._file_text_cache
    return cache


def _warm_file_text_cache(session, settings: dict, summary: dict) -> None:
    """Remember file contents while still on disk (before Delete/Write)."""
    root = (settings or {}).get("host_root")
    paths = _paths_from_summary(summary)
    if not root or not paths:
        return
    cache = _file_text_cache(session)
    for raw in paths[:6]:
        abs_path, rel = _resolve_host_file(str(root), raw)
        snap = _read_host_snapshot(abs_path)
        if snap is None:
            continue
        cache[rel] = snap
        cache[raw] = snap
        cache[str(raw).replace("\\", "/")] = snap
        if abs_path is not None:
            cache[str(abs_path)] = snap
        base = rel.split("/")[-1] if rel else ""
        if base:
            cache[base] = snap


def _cached_file_text(session, settings: dict, rel: str, raw: str):
    cache = _file_text_cache(session)
    base = (rel or "").split("/")[-1]
    for key in (rel, raw, str(raw).replace("\\", "/"), base):
        if key and key in cache:
            return cache[key]
    # Last resort for tracked files deleted before we could snapshot.
    root = (settings or {}).get("host_root")
    if not root or not rel:
        return None
    import subprocess

    try:
        proc = subprocess.run(
            ["git", "-C", str(root), "show", f"HEAD:{rel}"],
            capture_output=True,
            text=True,
            timeout=3,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    if proc.returncode != 0 or proc.stdout is None:
        return None
    if len(proc.stdout.encode("utf-8", errors="ignore")) > _EDIT_SNAPSHOT_BYTES:
        return None
    cache[rel] = proc.stdout
    if base:
        cache[base] = proc.stdout
    return proc.stdout


def _args_write_contents(args) -> str | None:
    if not isinstance(args, dict):
        return None
    # Write-only keys — never new_string (StrReplace fragment ≠ whole file).
    # Cursor SDK: fileText; compat: contents.
    for key in ("fileText", "file_text", "contents", "content", "text"):
        val = args.get(key)
        if isinstance(val, str):
            return val
    return None


def _apply_delete_counts(summary: dict, before, rel: str) -> None:
    if isinstance(before, (bytes, bytearray)):
        _apply_opaque_delete_counts(summary, rel, len(before))
        return
    lines = before.splitlines()
    summary["status"] = "deleted"
    summary["additions"] = 0
    summary["deletions"] = len(lines)
    summary["diff"] = [{
        "path": rel,
        "removed": lines[:_MAX_EDIT_PREVIEW_LINES],
        "added": [],
    }]


def _apply_edit_counts(summary: dict, before: str | None, after: str, rel: str, *, is_delete: bool) -> None:
    from backend.turn_changes import _diff_preview, _line_stats

    if is_delete or after is None:
        if before is not None:
            _apply_delete_counts(summary, before, rel)
        return
    if before is None:
        file_status = "created"
    else:
        file_status = "modified"
    additions, deletions = _line_stats(before, after)
    prev_add = int(summary.get("additions") or 0)
    prev_del = int(summary.get("deletions") or 0)
    summary["status"] = file_status
    # Trust disk/hunk stats when we got a real diff; else keep args/SDK counts.
    if additions or deletions:
        summary["additions"] = additions
        summary["deletions"] = deletions
    else:
        summary["additions"] = prev_add
        summary["deletions"] = prev_del
        if file_status == "created" and not prev_add and isinstance(after, str) and after:
            summary["additions"] = len(after.splitlines())
    preview = _diff_preview(before, after, rel)
    if preview:
        summary["diff"] = preview


def _attach_file_change_preview(
    session, settings: dict, summary: dict, *, args, result=None, call_id: str, status: str
) -> None:
    """Count +N/-M during the edit tool_call (running/completed), not at turn end."""
    paths = _paths_from_summary(summary)
    root = (settings or {}).get("host_root")
    if not root or not paths:
        return
    edit_cache = getattr(session, "_edit_previews", None)
    if edit_cache is None:
        session._edit_previews = {}
        edit_cache = session._edit_previews
    abs_path, rel = _resolve_host_file(str(root), paths[0])
    keys = [k for k in (call_id, rel, paths[0]) if k]
    title = str(summary.get("title") or "")
    is_delete = title.startswith(("Deleting ", "Deleted ")) or summary.get("status") == "deleted"
    sdk_add, sdk_del = _result_line_counts(result)

    def cached_before():
        """Running snapshot (before may be None = file did not exist)."""
        for key in keys:
            hit = edit_cache.get(key)
            if isinstance(hit, dict) and "before" in hit:
                return hit["before"], True
        return None, False

    def feed_undo_tracker(before_text):
        """Cursor pump: record first-write snap for turn undo (None = created)."""
        tracker = getattr(session, "_active_tracker", None)
        if tracker is None or not rel:
            return
        # Do not re-read disk here — completed writes already landed.
        tracker.seed_before(rel, before_text)
        if status == "completed":
            tracker.mark_touched(rel)

    if status == "running":
        # First snap wins — later partial/running events often arrive after the write.
        before, had_snap = cached_before()
        if not had_snap:
            before = _read_host_snapshot(abs_path)
            if before is None:
                before = _cached_file_text(session, settings, rel, paths[0])
            snap = {"before": before, "rel": rel}
            for key in keys:
                edit_cache[key] = snap
        feed_undo_tracker(before)
        if is_delete:
            if isinstance(before, str):
                _apply_delete_counts(summary, before, rel)
            elif isinstance(before, bytes):
                _apply_opaque_delete_counts(summary, rel, len(before))
            elif abs_path is not None and abs_path.is_file():
                # Too large to snapshot — still count the delete.
                try:
                    size = abs_path.stat().st_size
                except OSError:
                    size = 0
                _apply_opaque_delete_counts(summary, rel, size)
            else:
                _apply_opaque_delete_counts(summary, rel, 0)
            return
        after_args = _args_write_contents(args)
        if after_args is not None and not isinstance(before, bytes):
            _apply_edit_counts(summary, before, after_args, rel, is_delete=False)
        elif before is None and int(summary.get("additions") or 0) > 0:
            summary["status"] = "created"
        return

    # completed: never treat current disk as "before" (write already landed).
    before, had_snap = cached_before()
    if not had_snap:
        before = _cached_file_text(session, settings, rel, paths[0])
    after = _read_host_snapshot(abs_path)
    if after is None and not is_delete:
        after = _args_write_contents(args)
    if after is None and not is_delete:
        after = str(_result_value(result).get("fileContentAfterWrite") or "") or None

    if before is None and after is None:
        if is_delete:
            _apply_opaque_delete_counts(summary, rel, 0)
        elif sdk_add is not None:
            summary["additions"] = sdk_add
            summary["deletions"] = sdk_del if sdk_del is not None else 0
            if summary.get("status") not in {"deleted", "created", "modified"}:
                summary["status"] = "created" if (sdk_del or 0) == 0 and sdk_add > 0 else "modified"
        # Still track: created with SDK counts only, or unknown — before stays None.
        feed_undo_tracker(before)
        for key in keys:
            edit_cache.pop(key, None)
        return
    if after is None or is_delete:
        if isinstance(before, str):
            _apply_delete_counts(summary, before, rel)
        elif isinstance(before, bytes):
            _apply_opaque_delete_counts(summary, rel, len(before))
        else:
            _apply_opaque_delete_counts(summary, rel, 0)
    else:
        if isinstance(before, bytes) or isinstance(after, bytes):
            from backend.turn_changes import _diff_preview, _line_stats

            add, dele = _line_stats(before, after)
            summary["status"] = "created" if before is None else "modified"
            summary["additions"] = add
            summary["deletions"] = dele
            preview = _diff_preview(before, after, rel)
            if preview:
                summary["diff"] = preview
        else:
            _apply_edit_counts(summary, before, after or "", rel, is_delete=False)
        # Disk identity (+0) after a late snap: fall back to SDK / args counts.
        if not int(summary.get("additions") or 0) and not int(summary.get("deletions") or 0):
            if sdk_add is not None:
                summary["additions"] = sdk_add
                summary["deletions"] = sdk_del if sdk_del is not None else 0
                if before is None:
                    summary["status"] = "created"

    feed_undo_tracker(before)
    for key in keys:
        edit_cache.pop(key, None)


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


def _think_probe_enabled() -> bool:
    # Temporary: AI_AGENT_THINK_PROBE=1 python start.py
    import os

    return os.environ.get("AI_AGENT_THINK_PROBE", "").strip().lower() in {"1", "true", "yes"}


def _think_probe(event: str, session, **fields) -> None:
    """Append one JSON line for thinking-event A/B checks. No-op unless probe env set."""
    if not _think_probe_enabled():
        return
    import json
    import os
    import time
    from pathlib import Path

    path = Path(os.environ.get("AI_AGENT_THINK_PROBE_PATH", "/tmp/ai-agent-think-probe.jsonl"))
    mid = model_id_from_selection(
        getattr(session, "resolved_model", None)
        or getattr(session, "model_selection", None)
        or getattr(session, "model", None)
    )
    row = {
        "ts": time.time(),
        "event": event,
        "session_id": getattr(session, "session_id", ""),
        "model": mid,
        "gpt_family": session_is_gpt_family(session),
        **fields,
    }
    try:
        with path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(row, ensure_ascii=False) + "\n")
    except OSError:
        pass


def sse_from_delta(update, session, settings: dict) -> dict | None:
    """Map Cursor InteractionUpdate → widget SSE. Types must match cursor_sdk.types."""
    update_type = getattr(update, "type", None)
    # Probe: count every update type (find what GPT emits instead of thinking-*).
    if _think_probe_enabled() and update_type:
        extra = {}
        if update_type in {"thinking-delta", "text-delta"}:
            t = getattr(update, "text", "") or ""
            extra = {"text_len": len(t), "text_preview": str(t)[:80].replace("\n", "\\n")}
        elif update_type == "thinking-completed":
            extra = {"thinking_duration_ms": getattr(update, "thinking_duration_ms", None)}
        _think_probe(f"sdk:{update_type}", session, **extra)
    if update_type == "summary-started":
        return _session_event(session, "summary", content="", summary="")
    if update_type == "summary":
        text = str(getattr(update, "summary", None) or "")
        return _session_event(session, "summary", content=text, summary=text)
    if update_type == "summary-completed":
        return _session_event(
            session,
            "summary",
            content="",
            summary="",
            completed=True,
        )
    if update_type == "thinking-delta":
        text = getattr(update, "text", "") or ""
        _think_probe(
            "thinking-delta",
            session,
            text_len=len(text),
            text_preview=text[:80].replace("\n", "\\n"),
            wordish=len(text.split()) <= 2 and len(text) <= 24,
        )
        return _session_event(session, "thinking", content=text)
    if update_type == "thinking-completed":
        duration = getattr(update, "thinking_duration_ms", None)
        _think_probe(
            "thinking-completed",
            session,
            thinking_duration_ms=duration,
            dropped_for_gpt=False,
        )
        # Probe (tool turns): GPT and Claude both emit ~1 completed per think
        # burst, not per token. Per-word Thought spam was from sealing each
        # thinking-message — that path no longer emits completed.
        return _session_event(
            session,
            "thinking",
            content="",
            completed=True,
            thinking_duration_ms=duration,
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
                # So thinking-completed can detect GPT when picker is Auto.
                session.resolved_model = resolved
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
            # Cumulative snapshot only. Do NOT emit completed=True here —
            # the SDK can yield many thinking messages (even token-sized); sealing
            # each one spawned a pile of Thought cards. Seal via thinking-completed
            # delta, tool_call start, or turn end instead.
            text = getattr(message, "text", "") or ""
            if text:
                _think_probe(
                    "thinking-message",
                    session,
                    text_len=len(text),
                    text_preview=text[:80].replace("\n", "\\n"),
                    cumulative=True,
                )
                yield _session_event(session, "thinking", content=text, cumulative=True)
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
