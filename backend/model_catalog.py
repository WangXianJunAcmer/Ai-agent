"""Cursor model catalog: display names, Fast/Extra High hints, default variant params."""

from __future__ import annotations

from cursor_sdk import Cursor

DEFAULT_MODEL_OPTIONS = [
    {"id": "composer-2.5", "display_name": "Composer 2.5", "hint": "Fast", "params": [{"id": "fast", "value": "true"}]},
    {"id": "auto", "display_name": "Auto", "hint": "", "params": []},
]

_MODEL_CATALOG: dict[str, dict] = {}


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


def get_model_options(api_key: str) -> list[dict]:
    global _MODEL_CATALOG
    try:
        models = Cursor.models.list(api_key=api_key)
        options: list[dict] = []
        catalog: dict[str, dict] = {}
        seen: set[str] = set()
        for model in models:
            mid = getattr(model, "id", "") or ""
            if not mid or mid in seen:
                continue
            seen.add(mid)
            hint, params = _variant_hint(model)
            display = (getattr(model, "display_name", "") or mid).strip() or mid
            # SDK uses id=default for Auto.
            if mid == "default":
                mid = "auto"
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
        _MODEL_CATALOG = catalog
        return options or list(DEFAULT_MODEL_OPTIONS)
    except Exception:
        return list(DEFAULT_MODEL_OPTIONS)


def resolve_model_selection(model_id: str | None, fallback: str = "composer-2.5") -> str | dict:
    """Expand a model id into SDK ModelSelection JSON (id + default variant params)."""
    mid = (model_id or fallback or "composer-2.5").strip() or "composer-2.5"
    if mid == "default":
        mid = "auto"
    item = _MODEL_CATALOG.get(mid)
    if not item:
        return mid
    params = item.get("params") or []
    if not params:
        return mid
    return {"id": item["id"], "params": params}
