"""Minimal MCP client: stdio + Streamable HTTP (JSON). No extra deps.

# ponytail: newline-delimited JSON-RPC; full SDK if we need sampling/elicitation.
Config sources (later wins):
  1. config.yaml → mcp.servers
  2. {host_root}/.cursor/mcp.json (Cursor shape: mcpServers)
  3. {host_root}/.mcp.json
  4. data/mcp.json (sidecar overrides)
"""

from __future__ import annotations

import json
import os
import subprocess
import threading
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

_LOCK = threading.Lock()
_MANAGER: "McpManager | None" = None

_PROTOCOL = "2024-11-05"
_CLIENT_INFO = {"name": "coding-agent", "version": "0.1"}


def _as_server_list(raw) -> list[dict]:
    """Normalize Cursor {mcpServers:{name:{...}}} or list[{name,...}] or yaml map."""
    if not raw:
        return []
    if isinstance(raw, list):
        out = []
        for item in raw:
            if isinstance(item, dict) and item.get("name"):
                out.append(dict(item))
        return out
    if isinstance(raw, dict):
        # Cursor file: {"mcpServers": {...}} or bare name→cfg map
        block = raw.get("mcpServers") if isinstance(raw.get("mcpServers"), dict) else raw
        out = []
        for name, cfg in block.items():
            if name in {"mcpServers"} or not isinstance(cfg, dict):
                continue
            item = {"name": str(name), **cfg}
            out.append(item)
        return out
    return []


def load_mcp_server_configs(settings: dict) -> list[dict]:
    """Merge MCP server configs from yaml + project + data files."""
    root = Path(settings.get("root") or ".")
    host = settings.get("host_root")
    mcp_cfg = settings.get("mcp") or {}
    if isinstance(mcp_cfg, dict) and mcp_cfg.get("enabled") is False:
        return []

    merged: dict[str, dict] = {}

    def _add(items: list[dict]) -> None:
        for item in items:
            name = str(item.get("name") or "").strip()
            if not name:
                continue
            merged[name] = {**merged.get(name, {}), **item, "name": name}

    if isinstance(mcp_cfg, dict):
        _add(_as_server_list(mcp_cfg.get("servers")))

    from backend.ssh_workspace import is_ssh_uri

    paths: list[Path] = []
    if host and not is_ssh_uri(str(host)):
        hr = Path(host)
        paths.extend([hr / ".cursor" / "mcp.json", hr / ".mcp.json"])
    paths.append(root / "data" / "mcp.json")

    for path in paths:
        if not path.is_file():
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        _add(_as_server_list(data))

    return list(merged.values())


def _tool_name(server: str, tool: str) -> str:
    # Cursor-like: mcp__server__tool
    safe_s = "".join(c if c.isalnum() or c in "-_" else "_" for c in server)
    safe_t = "".join(c if c.isalnum() or c in "-_" else "_" for c in tool)
    return f"mcp__{safe_s}__{safe_t}"


def _parse_tool_name(name: str) -> tuple[str, str] | None:
    if not name.startswith("mcp__"):
        return None
    parts = name.split("__", 2)
    if len(parts) != 3 or not parts[1] or not parts[2]:
        return None
    return parts[1], parts[2]


def _content_to_text(result: Any) -> str:
    if result is None:
        return ""
    if isinstance(result, str):
        return result
    if isinstance(result, dict):
        if result.get("isError"):
            prefix = "MCP tool error: "
        else:
            prefix = ""
        chunks = result.get("content")
        if isinstance(chunks, list):
            texts = []
            for c in chunks:
                if isinstance(c, dict):
                    if c.get("type") == "text":
                        texts.append(str(c.get("text") or ""))
                    elif c.get("type") == "resource":
                        texts.append(json.dumps(c.get("resource") or c, ensure_ascii=False)[:4000])
                    else:
                        texts.append(json.dumps(c, ensure_ascii=False)[:2000])
                else:
                    texts.append(str(c))
            body = "\n".join(t for t in texts if t)
            return (prefix + body) if body else (prefix + json.dumps(result, ensure_ascii=False)[:6000])
        return prefix + json.dumps(result, ensure_ascii=False)[:6000]
    return str(result)[:6000]


class _StdioSession:
    def __init__(self, name: str, command: str, args: list[str], env: dict[str, str] | None):
        self.name = name
        self._lock = threading.Lock()
        self._id = 0
        merged = os.environ.copy()
        if env:
            merged.update({str(k): str(v) for k, v in env.items()})
        # Windows: run via list; shell=False
        cmd = [command, *(args or [])]
        self._proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=merged,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
        )
        self._alive = True

    def close(self) -> None:
        self._alive = False
        try:
            if self._proc.stdin:
                self._proc.stdin.close()
        except Exception:
            pass
        try:
            self._proc.terminate()
        except Exception:
            pass
        try:
            self._proc.wait(timeout=2)
        except Exception:
            try:
                self._proc.kill()
            except Exception:
                pass

    def request(self, method: str, params: dict | None = None, *, timeout: float = 60.0) -> Any:
        if not self._alive or self._proc.poll() is not None:
            raise RuntimeError(f"MCP server {self.name} is not running")
        with self._lock:
            self._id += 1
            req_id = self._id
            msg = {"jsonrpc": "2.0", "id": req_id, "method": method}
            if params is not None:
                msg["params"] = params
            line = json.dumps(msg, ensure_ascii=False) + "\n"
            assert self._proc.stdin and self._proc.stdout
            self._proc.stdin.write(line)
            self._proc.stdin.flush()
            # Read until matching id (skip notifications / stray lines).
            deadline = threading.Event()
            # ponytail: blocking readline with process-level timeout via wait on poll
            import time

            t0 = time.time()
            while time.time() - t0 < timeout:
                if self._proc.poll() is not None:
                    err = ""
                    try:
                        err = (self._proc.stderr.read() or "")[:500] if self._proc.stderr else ""
                    except Exception:
                        pass
                    raise RuntimeError(f"MCP server {self.name} exited: {err or 'no stderr'}")
                # Non-blocking-ish: stdout is line-buffered text mode
                raw = self._proc.stdout.readline()
                if not raw:
                    time.sleep(0.05)
                    continue
                raw = raw.strip()
                if not raw:
                    continue
                try:
                    data = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                if data.get("id") != req_id:
                    continue
                if "error" in data:
                    err = data["error"]
                    raise RuntimeError(f"MCP {method}: {err}")
                return data.get("result")
            raise TimeoutError(f"MCP {method} timed out ({timeout}s) on {self.name}")

    def notify(self, method: str, params: dict | None = None) -> None:
        with self._lock:
            msg: dict[str, Any] = {"jsonrpc": "2.0", "method": method}
            if params is not None:
                msg["params"] = params
            line = json.dumps(msg, ensure_ascii=False) + "\n"
            assert self._proc.stdin
            self._proc.stdin.write(line)
            self._proc.stdin.flush()


class _HttpSession:
    """Streamable HTTP: POST JSON-RPC; accept application/json responses."""

    def __init__(self, name: str, url: str, headers: dict[str, str] | None = None):
        self.name = name
        self.url = url.rstrip("/")
        self.headers = {str(k): str(v) for k, v in (headers or {}).items()}
        self._id = 0
        self._lock = threading.Lock()
        self._session_id = ""

    def close(self) -> None:
        return

    def request(self, method: str, params: dict | None = None, *, timeout: float = 60.0) -> Any:
        with self._lock:
            self._id += 1
            req_id = self._id
            body = {"jsonrpc": "2.0", "id": req_id, "method": method}
            if params is not None:
                body["params"] = params
            data = json.dumps(body).encode("utf-8")
            req = urllib.request.Request(
                self.url,
                data=data,
                method="POST",
                headers={
                    "Content-Type": "application/json",
                    "Accept": "application/json, text/event-stream",
                    **self.headers,
                    **({"Mcp-Session-Id": self._session_id} if self._session_id else {}),
                },
            )
            try:
                with urllib.request.urlopen(req, timeout=timeout) as resp:
                    sid = resp.headers.get("Mcp-Session-Id") or resp.headers.get("mcp-session-id")
                    if sid:
                        self._session_id = sid
                    ctype = (resp.headers.get("Content-Type") or "").lower()
                    raw = resp.read().decode("utf-8", errors="replace")
            except urllib.error.HTTPError as err:
                detail = err.read().decode("utf-8", errors="replace")[:500]
                raise RuntimeError(f"MCP HTTP {method}: {err.code} {detail}") from err
            except Exception as err:
                raise RuntimeError(f"MCP HTTP {method}: {err}") from err

            if "text/event-stream" in ctype:
                # Take last data: JSON payload from SSE.
                payload = None
                for block in raw.split("\n"):
                    if block.startswith("data:"):
                        chunk = block[5:].strip()
                        if chunk and chunk != "[DONE]":
                            try:
                                payload = json.loads(chunk)
                            except json.JSONDecodeError:
                                continue
                data_obj = payload
            else:
                data_obj = json.loads(raw) if raw.strip() else None

            if not isinstance(data_obj, dict):
                raise RuntimeError(f"MCP HTTP {method}: empty/invalid response")
            if "error" in data_obj:
                raise RuntimeError(f"MCP {method}: {data_obj['error']}")
            return data_obj.get("result")

    def notify(self, method: str, params: dict | None = None) -> None:
        # Fire-and-forget POST (ignore result).
        try:
            self.request(method, params, timeout=15.0)
        except Exception:
            pass


class McpServerHandle:
    def __init__(self, cfg: dict):
        self.cfg = cfg
        self.name = str(cfg.get("name") or "").strip()
        self.session: _StdioSession | _HttpSession | None = None
        self.tools: list[dict] = []
        self.resources: list[dict] = []
        self.prompts: list[dict] = []
        self.error: str = ""
        self._lock = threading.Lock()

    def start(self) -> None:
        with self._lock:
            if self.session is not None:
                return
            try:
                url = str(self.cfg.get("url") or "").strip()
                if url:
                    headers = self.cfg.get("headers") if isinstance(self.cfg.get("headers"), dict) else {}
                    self.session = _HttpSession(self.name, url, headers)
                else:
                    command = str(self.cfg.get("command") or "").strip()
                    if not command:
                        raise RuntimeError("MCP server needs command or url")
                    args = self.cfg.get("args") or []
                    if not isinstance(args, list):
                        args = [str(args)]
                    env = self.cfg.get("env") if isinstance(self.cfg.get("env"), dict) else {}
                    self.session = _StdioSession(self.name, command, [str(a) for a in args], env)

                assert self.session is not None
                self.session.request(
                    "initialize",
                    {
                        "protocolVersion": _PROTOCOL,
                        "capabilities": {},
                        "clientInfo": _CLIENT_INFO,
                    },
                    timeout=30.0,
                )
                # Spec: notification after initialize
                if isinstance(self.session, _StdioSession):
                    self.session.notify("notifications/initialized", {})
                else:
                    try:
                        self.session.notify("notifications/initialized", {})
                    except Exception:
                        pass

                tools_res = self.session.request("tools/list", {}, timeout=30.0) or {}
                self.tools = list(tools_res.get("tools") or []) if isinstance(tools_res, dict) else []

                try:
                    res = self.session.request("resources/list", {}, timeout=15.0) or {}
                    self.resources = list(res.get("resources") or []) if isinstance(res, dict) else []
                except Exception:
                    self.resources = []

                try:
                    pr = self.session.request("prompts/list", {}, timeout=15.0) or {}
                    self.prompts = list(pr.get("prompts") or []) if isinstance(pr, dict) else []
                except Exception:
                    self.prompts = []
                self.error = ""
            except Exception as err:
                self.error = str(err)
                self.close()
                raise

    def close(self) -> None:
        with self._lock:
            if self.session is not None:
                try:
                    self.session.close()
                except Exception:
                    pass
            self.session = None

    def call_tool(self, tool: str, arguments: dict) -> str:
        self.start()
        assert self.session is not None
        result = self.session.request(
            "tools/call",
            {"name": tool, "arguments": arguments or {}},
            timeout=float(self.cfg.get("timeout") or 120),
        )
        return _content_to_text(result)

    def read_resource(self, uri: str) -> str:
        self.start()
        assert self.session is not None
        result = self.session.request("resources/read", {"uri": uri}, timeout=60.0)
        return _content_to_text(result if isinstance(result, dict) else {"content": result})

    def get_prompt(self, name: str, arguments: dict | None = None) -> str:
        self.start()
        assert self.session is not None
        params: dict[str, Any] = {"name": name}
        if arguments:
            params["arguments"] = arguments
        result = self.session.request("prompts/get", params, timeout=60.0)
        return _content_to_text(result if isinstance(result, dict) else {"content": [{"type": "text", "text": str(result)}]})


class McpManager:
    def __init__(self, configs: list[dict]):
        self._servers = {str(c["name"]): McpServerHandle(c) for c in configs if c.get("name")}
        self._started = False
        self._errors: dict[str, str] = {}

    def ensure_started(self) -> None:
        if self._started:
            return
        with _LOCK:
            if self._started:
                return
            for name, handle in self._servers.items():
                try:
                    handle.start()
                except Exception as err:
                    self._errors[name] = str(err)
            self._started = True

    def close(self) -> None:
        for handle in self._servers.values():
            handle.close()
        self._started = False

    def status(self) -> list[dict]:
        self.ensure_started()
        out = []
        for name, h in self._servers.items():
            out.append({
                "name": name,
                "ok": not bool(h.error or self._errors.get(name)),
                "error": h.error or self._errors.get(name) or "",
                "tools": len(h.tools),
                "resources": len(h.resources),
                "prompts": len(h.prompts),
                "transport": "http" if str(h.cfg.get("url") or "").strip() else "stdio",
            })
        return out

    def openai_tools(self) -> list[dict]:
        """OpenAI function schemas for all MCP tools + resource/prompt helpers."""
        self.ensure_started()
        schemas: list[dict] = []
        for name, h in self._servers.items():
            if h.error or self._errors.get(name):
                continue
            for tool in h.tools:
                tname = str(tool.get("name") or "").strip()
                if not tname:
                    continue
                desc = str(tool.get("description") or f"MCP tool {tname} via {name}")
                params = tool.get("inputSchema") or {"type": "object", "properties": {}}
                schemas.append({
                    "type": "function",
                    "function": {
                        "name": _tool_name(name, tname),
                        "description": f"[MCP:{name}] {desc}",
                        "parameters": params,
                    },
                })
            if h.resources:
                schemas.append({
                    "type": "function",
                    "function": {
                        "name": _tool_name(name, "resources_read"),
                        "description": f"[MCP:{name}] Read a resource by URI",
                        "parameters": {
                            "type": "object",
                            "properties": {"uri": {"type": "string"}},
                            "required": ["uri"],
                        },
                    },
                })
                schemas.append({
                    "type": "function",
                    "function": {
                        "name": _tool_name(name, "resources_list"),
                        "description": f"[MCP:{name}] List available resources",
                        "parameters": {"type": "object", "properties": {}},
                    },
                })
            if h.prompts:
                schemas.append({
                    "type": "function",
                    "function": {
                        "name": _tool_name(name, "prompts_get"),
                        "description": f"[MCP:{name}] Get a prompt template",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string"},
                                "arguments": {"type": "object"},
                            },
                            "required": ["name"],
                        },
                    },
                })
        return schemas

    def call(self, openai_name: str, arguments: dict | str | None) -> str:
        self.ensure_started()
        parsed = _parse_tool_name(openai_name)
        if not parsed:
            return f"not an MCP tool: {openai_name}"
        server, tool = parsed
        handle = self._servers.get(server)
        if handle is None:
            # try match ignoring sanitization — already sanitized names
            for n, h in self._servers.items():
                if _tool_name(n, "x").rsplit("__", 1)[0] == f"mcp__{server}":
                    handle = h
                    break
        if handle is None:
            return f"unknown MCP server: {server}"
        if handle.error or self._errors.get(handle.name):
            return f"MCP server {handle.name} unavailable: {handle.error or self._errors.get(handle.name)}"

        if isinstance(arguments, str):
            try:
                args = json.loads(arguments or "{}")
            except json.JSONDecodeError:
                return f"invalid MCP arguments JSON: {arguments[:200]}"
        else:
            args = arguments or {}
        if not isinstance(args, dict):
            return "MCP arguments must be an object"

        try:
            if tool == "resources_list":
                handle.start()
                return json.dumps(handle.resources, ensure_ascii=False)[:8000] or "[]"
            if tool == "resources_read":
                uri = str(args.get("uri") or "").strip()
                if not uri:
                    return "uri is required"
                return handle.read_resource(uri)
            if tool == "prompts_get":
                pname = str(args.get("name") or "").strip()
                if not pname:
                    return "name is required"
                pargs = args.get("arguments") if isinstance(args.get("arguments"), dict) else None
                return handle.get_prompt(pname, pargs)
            return handle.call_tool(tool, args)
        except Exception as err:
            return f"MCP call failed: {err}"


def get_mcp_manager(settings: dict, *, refresh: bool = False) -> McpManager:
    global _MANAGER
    with _LOCK:
        if _MANAGER is not None and not refresh:
            return _MANAGER
        if _MANAGER is not None:
            try:
                _MANAGER.close()
            except Exception:
                pass
        configs = load_mcp_server_configs(settings)
        _MANAGER = McpManager(configs)
        return _MANAGER


def demo() -> None:
    # Framing / naming only — no live server required.
    assert _tool_name("fs", "read_file") == "mcp__fs__read_file"
    assert _parse_tool_name("mcp__fs__read_file") == ("fs", "read_file")
    assert _as_server_list({"mcpServers": {"a": {"command": "x"}}})[0]["name"] == "a"
    assert _content_to_text({"content": [{"type": "text", "text": "hi"}]}) == "hi"
    print("mcp_client demo ok")


if __name__ == "__main__":
    demo()
