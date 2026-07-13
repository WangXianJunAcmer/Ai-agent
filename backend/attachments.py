"""Chat attachments: materialize uploads and build SDK message payloads."""

from __future__ import annotations

import base64
import re
import uuid
from pathlib import Path

from cursor_sdk import SDKImage, UserMessage

from backend.repo_write_guard import UPLOAD_DIR, identity_prefix
from backend.safety import policy_prefix

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


def image_attachments(attachments: list[dict] | None) -> list[dict]:
  out: list[dict] = []
  for item in attachments or []:
    if not item.get("data"):
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
  saved: list[dict] = []
  for item in attachments:
    mime = resolve_attachment_mime(item)
    if is_image(mime):
      continue
    raw = item.get("data") or ""
    try:
      data = base64.b64decode(raw, validate=False)
    except Exception:
      continue
    if not data:
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
