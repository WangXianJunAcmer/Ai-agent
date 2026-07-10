#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

# Prefer: PYTHON=... > active conda > conda env ai-agent > python3.10+ on PATH
resolve_python() {
  if [[ -n "${PYTHON:-}" ]]; then
    printf '%s\n' "$PYTHON"
    return
  fi
  if [[ -n "${CONDA_PREFIX:-}" && -x "${CONDA_PREFIX}/bin/python" ]]; then
    if "${CONDA_PREFIX}/bin/python" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)' 2>/dev/null; then
      printf '%s\n' "${CONDA_PREFIX}/bin/python"
      return
    fi
  fi
  local base cand
  for base in "${HOME}/miniconda3" "${HOME}/anaconda3" "${HOME}/mambaforge" "${HOME}/miniforge3"; do
    cand="${base}/envs/ai-agent/bin/python"
    if [[ -x "$cand" ]]; then
      printf '%s\n' "$cand"
      return
    fi
  done
  for cand in python3.12 python3.11 python3.10 python3 python; do
    if command -v "$cand" >/dev/null 2>&1; then
      if "$cand" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)' 2>/dev/null; then
        command -v "$cand"
        return
      fi
    fi
  done
  echo "Need Python 3.10+. Example:" >&2
  echo "  conda create -n ai-agent python=3.10 && conda activate ai-agent && pip install -r requirements.txt" >&2
  exit 1
}

PYTHON_BIN="$(resolve_python)"
exec "$PYTHON_BIN" start.py
