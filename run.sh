#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

pick_python() {
  for candidate in \
    "${PYTHON:-}" \
    "$DIR/ai/bin/python" \
    /data1/wangxianjun/miniconda3/envs/ad-plx/bin/python \
    /data/miniconda/envs/ad-plx/bin/python \
    python3.12 python3.11 python3.10 python3; do
    [[ -n "$candidate" && -x "$candidate" ]] || continue
    if "$candidate" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)' 2>/dev/null; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

PY="$(pick_python)" || {
  echo "Need Python 3.10+ (cursor-sdk requirement). Install one or set PYTHON=/path/to/python3.10"
  exit 1
}

if [[ ! -f .env ]]; then
  echo "Missing .env — copy .env.example and set CURSOR_API_KEY"
  exit 1
fi

"$PY" -m pip install -q -r requirements.txt
exec "$PY" -m backend.main
