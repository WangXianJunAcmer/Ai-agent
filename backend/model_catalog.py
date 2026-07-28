"""Cursor model catalog: display names, Fast/Extra High hints, default variant params."""

from __future__ import annotations

import json
import logging
import threading
from pathlib import Path

import httpx
from cursor_sdk.types import SDKModel

DEFAULT_MODEL_OPTIONS = [
    {"id": "auto", "display_name": "Auto", "hint": "", "params": []},
    {"id": "composer-2.5", "display_name": "Composer 2.5", "hint": "Fast", "params": [{"id": "fast", "value": "true"}]},
]

_MODELS_URL = "https://api.cursor.com/v1/models"
_log = logging.getLogger(__name__)

_CACHE_PATH = Path(__file__).with_name("model_options_cache.json")
_REFRESH_LOCK = threading.Lock()


def _read_cache() -> list[dict]:
    try:
        data = json.loads(_CACHE_PATH.read_text(encoding="utf-8"))
        if isinstance(data, list) and all(isinstance(item, dict) and item.get("id") for item in data):
            return data
    except (OSError, ValueError, TypeError):
        pass
    return list(DEFAULT_MODEL_OPTIONS)


def _write_cache(options: list[dict]) -> None:
    """Atomic replace so readers never observe a partial catalog."""
    tmp = _CACHE_PATH.with_suffix(".json.tmp")
    tmp.write_text(
        json.dumps(options, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    tmp.replace(_CACHE_PATH)


_MODEL_OPTIONS: list[dict] = _read_cache()
_MODEL_CATALOG: dict[str, dict] = {
    str(item["id"]): item for item in _MODEL_OPTIONS if item.get("id")
}


def normalize_model_id(model_id: str | None) -> str:
    mid = (model_id or "").strip()
    return "auto" if mid == "default" else mid


def _pretty_model_id(mid: str) -> str:
    """composer-2.5 → Composer 2.5 when catalog has no display_name yet."""
    parts: list[str] = []
    for part in mid.replace("_", "-").split("-"):
        if not part:
            continue
        if part.replace(".", "", 1).isdigit():
            parts.append(part)
        else:
            parts.append(part[:1].upper() + part[1:])
    return " ".join(parts) or mid


def _variant_hint(model) -> tuple[str, list[dict]]:
    """Build Cursor-style gray hint (Fast / Extra High) from the default variant."""
    variants = list(getattr(model, "variants", ()) or ())
    default = next((v for v in variants if getattr(v, "is_default", False)), None)
    if default is None and variants:
        default = variants[0]
    if default is None:
        return "", []

    value_labels: dict[tuple[str, str], str] = {}
    for param_def in getattr(model, "parameters", ()) or ():
        pid = getattr(param_def, "id", "") or ""
        for val in getattr(param_def, "values", ()) or ():
            value_labels[(pid, getattr(val, "value", ""))] = (
                getattr(val, "display_name", "") or ""
            ).strip()

    hints: list[str] = []
    params: list[dict] = []
    for param in getattr(default, "params", ()) or ():
        pid = getattr(param, "id", "") or ""
        pval = getattr(param, "value", "") or ""
        if not pid:
            continue
        params.append({"id": pid, "value": pval})
        # Skip toggles Cursor doesn't show as trailing labels.
        if pid in {"thinking", "cyber", "context"}:
            continue
        label = value_labels.get((pid, pval), "").strip("\u200b ").strip()
        if label:
            hints.append(label)
    return " ".join(hints), params


def _fetch_models_http(api_key: str) -> list[SDKModel]:
    """Cloud catalog via REST — avoids Cursor.models.list bridge launch (fails on some Windows setups)."""
    key = (api_key or "").strip()
    if not key:
        raise RuntimeError("CURSOR_API_KEY is empty")
    response = httpx.get(
        _MODELS_URL,
        headers={"Authorization": f"Bearer {key}"},
        timeout=30.0,
    )
    response.raise_for_status()
    data = response.json()
    if isinstance(data, list):
        raw_items = data
    elif isinstance(data, dict):
        raw_items = data.get("items") or data.get("models") or data.get("data") or []
    else:
        raw_items = []
    models: list[SDKModel] = []
    for item in raw_items:
        if isinstance(item, str):
            mid = normalize_model_id(item)
            if mid:
                models.append(SDKModel(id=mid, display_name=_pretty_model_id(mid)))
            continue
        if isinstance(item, dict):
            models.append(SDKModel.from_json(item))
    return models


def get_model_options(api_key: str, *, refresh: bool = False) -> list[dict]:
    """Return disk/memory cache; refresh=True hits api.cursor.com/v1/models and rewrites file if changed."""
    global _MODEL_CATALOG, _MODEL_OPTIONS
    if _MODEL_OPTIONS and not refresh:
        return list(_MODEL_OPTIONS)
    with _REFRESH_LOCK:
        if _MODEL_OPTIONS and not refresh:
            return list(_MODEL_OPTIONS)
        try:
            models = _fetch_models_http(api_key)
            options: list[dict] = []
            catalog: dict[str, dict] = {}
            seen: set[str] = set()
            for model in models:
                mid = normalize_model_id(getattr(model, "id", "") or "")
                if not mid or mid in seen:
                    continue
                seen.add(mid)
                hint, params = _variant_hint(model)
                display = (getattr(model, "display_name", "") or mid).strip() or mid
                # SDK / API uses id=default for Auto.
                if mid == "auto":
                    display = "Auto"
                item = {"id": mid, "display_name": display, "hint": hint, "params": params}
                options.append(item)
                catalog[mid] = item
            if "auto" not in catalog:
                auto = {"id": "auto", "display_name": "Auto", "hint": "", "params": []}
                options.insert(0, auto)
                catalog["auto"] = auto
            else:
                options = [catalog["auto"]] + [o for o in options if o["id"] != "auto"]
            options = options or list(DEFAULT_MODEL_OPTIONS)
            if options != _MODEL_OPTIONS:
                _write_cache(options)
            _MODEL_CATALOG = {str(item["id"]): item for item in options}
            _MODEL_OPTIONS = options
        except Exception as exc:
            _log.warning("model catalog refresh failed: %s", exc)
        return list(_MODEL_OPTIONS)


def model_display_name(model_id: str) -> str:
    mid = normalize_model_id(model_id)
    if not mid or mid == "auto":
        return "Auto" if mid == "auto" else mid
    item = _MODEL_CATALOG.get(mid)
    if item:
        return str(item.get("display_name") or mid)
    return _pretty_model_id(mid)


def resolve_model_selection(model_id: str | None, fallback: str = "auto") -> str | dict:
    """Expand a model id into SDK ModelSelection JSON (id + default variant params)."""
    mid = normalize_model_id(model_id or fallback or "auto") or "auto"
    item = _MODEL_CATALOG.get(mid)
    if not item:
        return mid
    params = item.get("params") or []
    if not params:
        return mid
    return {"id": item["id"], "params": params}
