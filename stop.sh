#!/usr/bin/env bash
# Stop Coding Agent (CA): pid file, port 8765 listener, orphan cursor-sdk-bridge.
set -uo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

PORT="${CODING_AGENT_PORT:-8765}"
stopped=0

kill_tree() {
  local pid="$1"
  [[ -n "$pid" && "$pid" =~ ^[0-9]+$ ]] || return 0
  if ! kill -0 "$pid" 2>/dev/null; then
    return 0
  fi
  # Children first (bridge / workers), then parent.
  local kids
  kids="$(pgrep -P "$pid" 2>/dev/null || true)"
  local c
  for c in $kids; do
    kill_tree "$c"
  done
  kill "$pid" 2>/dev/null || true
  sleep 0.2
  if kill -0 "$pid" 2>/dev/null; then
    kill -9 "$pid" 2>/dev/null || true
  fi
  echo "Stopped PID $pid"
  stopped=1
}

for pid_file in data/coding-agent.pid data/ai-agent.pid; do
  if [[ -f "$pid_file" ]]; then
    old="$(tr -d '[:space:]' <"$pid_file" 2>/dev/null || true)"
    if [[ -n "$old" && "$old" =~ ^[0-9]+$ ]]; then
      kill_tree "$old"
    fi
    rm -f "$pid_file"
  fi
done

# Anything still listening on the service port.
if command -v lsof >/dev/null 2>&1; then
  while read -r pid; do
    [[ -n "$pid" ]] || continue
    kill_tree "$pid"
    echo "Freed port $PORT, killed PID $pid"
  done < <(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)
elif command -v fuser >/dev/null 2>&1; then
  if fuser "${PORT}/tcp" >/dev/null 2>&1; then
    fuser -k "${PORT}/tcp" >/dev/null 2>&1 || true
    echo "Freed port $PORT"
    stopped=1
  fi
fi

# Orphan Node bridges left after a hard kill of the parent.
if command -v pgrep >/dev/null 2>&1; then
  while read -r pid; do
    [[ -n "$pid" ]] || continue
    cmdline="$(ps -p "$pid" -o args= 2>/dev/null || true)"
    if [[ "$cmdline" == *cursor-sdk-bridge* ]]; then
      kill_tree "$pid"
      echo "Killed orphan bridge PID $pid"
    fi
  done < <(pgrep -f cursor-sdk-bridge 2>/dev/null || true)
fi

echo "CA stopped."
exit 0
