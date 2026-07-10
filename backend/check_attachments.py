"""Self-check: non-image uploads land under host .ai-agent-uploads/."""

from __future__ import annotations

import base64
import shutil
import tempfile
from pathlib import Path

from backend.sessions import SessionManager


def main() -> None:
    root = Path(tempfile.mkdtemp(prefix="ai-agent-attach-"))
    try:
        mgr = SessionManager(
            {
                "host_root": str(root),
                "api_key": "x",
                "model": "composer-2.5",
                "runtime": "local",
            }
        )
        payload = base64.b64encode(b"hello-file").decode("ascii")
        files = mgr._materialize_files(
            [{"name": "note.txt", "mime_type": "text/plain", "data": payload}]
        )
        assert len(files) == 1, files
        path = root / files[0]["path"]
        assert path.is_file(), path
        assert path.read_bytes() == b"hello-file"
        images, _ = mgr._build_message(
            "hi",
            [{"name": "a.png", "mime_type": "image/png", "data": "aaa"}],
        )
        assert getattr(images, "images", None) is not None
        print("ok attachments")
    finally:
        shutil.rmtree(root, ignore_errors=True)


if __name__ == "__main__":
    main()
