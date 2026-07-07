#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

PYTHON_BIN="${PYTHON:-python3}"
exec "$PYTHON_BIN" start.py
