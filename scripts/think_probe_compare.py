#!/usr/bin/env python3
"""Run two Cursor turns (GPT vs non-GPT) and summarize think-probe JSONL.

Requires server started with:
  AI_AGENT_THINK_PROBE=1 AI_AGENT_THINK_PROBE_PATH=/tmp/ai-agent-think-probe.jsonl python start.py
"""

from __future__ import annotations

import json
import sys
import time
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8765"
PROBE = Path("/tmp/ai-agent-think-probe.jsonl")
PROMPT = (
    "在项目根目录创建 rbtree_probe.cpp，实现一个带中文注释的红黑树（插入/删除/中序），"
    "并写一个 main 做简单自测打印。不要改其它已有业务文件。做完用一两句话说明即可。"
)
MODELS = [
    ("gpt-rbtree", "gpt-5.4"),
    ("claude-rbtree", "claude-sonnet-4-5"),
]


def post_stream(model: str) -> dict:
    body = json.dumps({
        "message": PROMPT,
        "model": model,
        "mode": "agent",
        "provider": "cursor",
    }).encode("utf-8")
    req = urllib.request.Request(
        BASE.rstrip("/") + "/api/chat/stream",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    thinking_sse = 0
    thinking_completed_sse = 0
    text_chars = 0
    err = ""
    with urllib.request.urlopen(req, timeout=420) as resp:
        for raw in resp:
            line = raw.decode("utf-8", errors="replace").strip()
            if not line.startswith("data:"):
                continue
            try:
                ev = json.loads(line[5:].strip())
            except json.JSONDecodeError:
                continue
            t = ev.get("type")
            if t == "thinking":
                if ev.get("completed"):
                    thinking_completed_sse += 1
                else:
                    thinking_sse += 1
            elif t == "text":
                text_chars += len(ev.get("content") or "")
            elif t == "error":
                err = str(ev.get("content") or ev)
            elif t == "done":
                break
    return {
        "thinking_sse": thinking_sse,
        "thinking_completed_sse": thinking_completed_sse,
        "text_chars": text_chars,
        "error": err,
    }


def summarize(tag: str, model: str, before: int) -> None:
    rows = []
    if PROBE.is_file():
        lines = PROBE.read_text(encoding="utf-8").splitlines()
        for line in lines[before:]:
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    # Prefer rows tagged with this model id (resolved may differ slightly).
    mine = [r for r in rows if model in str(r.get("model") or "") or str(r.get("model") or "") in model]
    if not mine:
        mine = rows
    counts = Counter(r.get("event") for r in mine)
    sdk = Counter(
        str(r.get("event") or "")[4:]
        for r in mine
        if str(r.get("event") or "").startswith("sdk:")
    )
    delta_lens = [int(r.get("text_len") or 0) for r in mine if r.get("event") == "thinking-delta"]
    wordish = sum(1 for r in mine if r.get("event") == "thinking-delta" and r.get("wordish"))
    completed = [r for r in mine if r.get("event") == "thinking-completed"]
    dropped = sum(1 for r in completed if r.get("dropped_for_gpt"))
    previews = [
        r.get("text_preview")
        for r in mine
        if r.get("event") == "thinking-delta" and r.get("text_preview")
    ][:8]
    print(f"\n=== {tag} model={model} ===")
    print(f"sdk update types: {dict(sdk)}")
    print(f"probe events: {dict(counts)}")
    print(f"thinking-delta count={len(delta_lens)} "
          f"avg_len={sum(delta_lens)/len(delta_lens):.1f}" if delta_lens else
          "thinking-delta count=0")
    if delta_lens:
        print(f"thinking-delta median_len={sorted(delta_lens)[len(delta_lens)//2]} "
              f"max_len={max(delta_lens)} wordish_deltas={wordish}/{len(delta_lens)}")
    print(f"thinking-completed count={len(completed)} dropped_for_gpt={dropped}")
    if completed:
        durs = [r.get("thinking_duration_ms") for r in completed]
        print(f"completed duration_ms sample={durs[:10]}")
    print(f"delta previews: {previews}")
    # Ratio that would spam Thought cards if we sealed on every completed.
    if completed and delta_lens:
        print(f"completed/delta ratio={len(completed)/len(delta_lens):.2f} "
              f"(~1.0 means completed roughly every delta)")
    if sdk.get("thinking-completed") and sdk.get("thinking-delta"):
        print(
            f"RAW completed/delta="
            f"{sdk['thinking-completed']}/{sdk['thinking-delta']}="
            f"{sdk['thinking-completed']/sdk['thinking-delta']:.2f}"
        )


def main() -> None:
    PROBE.write_text("", encoding="utf-8")
    print(f"probe file cleared: {PROBE}")
    print(f"base={BASE}")
    for tag, model in MODELS:
        before = len(PROBE.read_text(encoding="utf-8").splitlines()) if PROBE.is_file() else 0
        print(f"\n>>> streaming {model} …")
        t0 = time.time()
        try:
            sse = post_stream(model)
        except Exception as exc:
            print(f"STREAM FAIL {model}: {exc}")
            continue
        print(f"done in {time.time()-t0:.1f}s sse={sse}")
        time.sleep(0.5)
        summarize(tag, model, before)


if __name__ == "__main__":
    main()
