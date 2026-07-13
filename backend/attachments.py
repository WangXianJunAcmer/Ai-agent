"""Chat attachments: materialize uploads and build SDK message payloads."""

from __future__ import annotations

import base64
import re
import time
import uuid
from pathlib import Path

from cursor_sdk import SDKImage, UserMessage

from backend.repo_write_guard import UPLOAD_DIR, identity_prefix
from backend.safety import policy_prefix

# Per-file decoded size cap (images + non-images). Oversize → skipped.
MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
# Cap how many files we keep under .ai-agent-uploads (oldest mtime first).
MAX_UPLOAD_FILES = 40
# Also drop uploads older than this even if under the count cap.
UPLOAD_MAX_AGE_SEC = 7 * 24 * 3600

_IMAGE_EXT_MIME = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
}


def is_image(mime_type: str) -> bool:
  return (mime_type or "").startswith("image/")


def safe_filename(name: str) -> str:
  base = Path(name or "file").name
  cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", base).strip("._") or "file"
  return cleaned[:120]


def resolve_attachment_mime(item: dict) -> str:
  """Browsers often leave file.type empty; fall back to extension."""
  mime = (item.get("mime_type") or "").strip()
  if is_image(mime):
    return mime
  ext = Path(item.get("name") or "").suffix.lower()
  return _IMAGE_EXT_MIME.get(ext, mime or "application/octet-stream")


def attachment_within_size_limit(raw: str) -> bool:
  """True if base64 payload is non-empty and under MAX_ATTACHMENT_BYTES (approx)."""
  if not raw:
    return False
  # base64 expands ~4/3; reject before decode to avoid huge allocations.
  return len(raw) <= int(MAX_ATTACHMENT_BYTES * 1.4) + 64


def decode_attachment_bytes(raw: str) -> bytes | None:
  """Decode base64 payload; None if empty, invalid, or over MAX_ATTACHMENT_BYTES."""
  if not attachment_within_size_limit(raw):
    return None
  try:
    pad = (-len(raw)) % 4
    data = base64.b64decode(raw + ("=" * pad), validate=False)
  except Exception:
    return None
  if not data or len(data) > MAX_ATTACHMENT_BYTES:
    return None
  return data


def prune_upload_dir(host_root: str | Path) -> int:
  """Delete stale/excess files under .ai-agent-uploads. Returns removed count."""
  upload_dir = Path(host_root).resolve() / UPLOAD_DIR
  if not upload_dir.is_dir():
    return 0
  now = time.time()
  files = [p for p in upload_dir.iterdir() if p.is_file()]
  removed = 0
  keep: list[Path] = []
  for path in files:
    try:
      age = now - path.stat().st_mtime
    except OSError:
      continue
    if age > UPLOAD_MAX_AGE_SEC:
      try:
        path.unlink()
        removed += 1
      except OSError:
        pass
    else:
      keep.append(path)
  if len(keep) > MAX_UPLOAD_FILES:
    keep.sort(key=lambda p: p.stat().st_mtime if p.exists() else 0)
    for path in keep[: len(keep) - MAX_UPLOAD_FILES]:
      try:
        path.unlink()
        removed += 1
      except OSError:
        pass
  return removed


def image_attachments(attachments: list[dict] | None) -> list[dict]:
  out: list[dict] = []
  for item in attachments or []:
    raw = item.get("data") or ""
    # Size-check only — SDK consumes the base64 string as-is (padding may be loose).
    if not attachment_within_size_limit(raw):
      continue
    mime = resolve_attachment_mime(item)
    if is_image(mime):
      out.append({**item, "mime_type": mime})
  return out


def materialize_files(host_root: str | Path, attachments: list[dict] | None) -> list[dict]:
  """Write non-image uploads into host workspace; SDK only accepts images natively."""
  if not attachments:
    return []
  root = Path(host_root).resolve()
  upload_dir = root / UPLOAD_DIR
  upload_dir.mkdir(parents=True, exist_ok=True)
  prune_upload_dir(root)
  saved: list[dict] = []
  for item in attachments:
    mime = resolve_attachment_mime(item)
    if is_image(mime):
      continue
    data = decode_attachment_bytes(item.get("data") or "")
    if data is None:
      continue
    filename = safe_filename(item.get("name") or "file")
    path = upload_dir / f"{uuid.uuid4().hex[:8]}_{filename}"
    path.write_bytes(data)
    rel = str(path.relative_to(root))
    saved.append({"name": filename, "mime_type": mime, "path": rel})
  return saved


def build_message(
  text: str,
  attachments: list[dict] | None,
  settings: dict,
  session=None,
):
  """Return (payload, saved_files). payload is str or UserMessage."""
  prompt = text.strip() if text else ""
  images = image_attachments(attachments)
  files = materialize_files(settings["host_root"], attachments)
  if files:
    listing = "\n".join(f"- {f['path']}" for f in files)
    note = (
      "用户上传了以下文件（已保存到工作区，请按需读取这些路径）：\n"
      f"{listing}"
    )
    prompt = f"{prompt}\n\n{note}" if prompt else note
  if not prompt and images:
    prompt = "请分析我上传的图片。"
  if session is not None:
    prompt = (
      policy_prefix(session)
      + identity_prefix(session, settings)
      + (prompt or "")
    )
  if not images:
    return prompt, files
  sdk_images = [
    SDKImage.data_image(image["data"], image["mime_type"])
    for image in images
  ]
  return UserMessage(text=prompt, images=sdk_images), files


def upload_meta(attachments: list[dict] | None, files: list[dict]) -> dict:
  """This-turn upload receipt for the UI (not persisted session history)."""
  images = [
    {"name": item.get("name") or "image", "mime_type": item.get("mime_type") or "application/octet-stream"}
    for item in image_attachments(attachments)
  ]
  return {"images": images, "files": files}
