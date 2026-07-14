"""Per-turn workspace file change tracking + undo.

# ponytail: first-write snapshot only; undo restores that snapshot (not intermediate edits).
"""

from __future__ import annotations

import difflib
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path


_MAX_SNAPSHOT_BYTES = 2_000_000
_MAX_DIFF_LINES = 80
_MAX_UNDO_TURNS = 12
_SKIP = object()  # too large / binary — do not track


def _line_stats(before: str | bytes | None, after: str | bytes | None) -> tuple[int, int]:
    """Return (additions, deletions). Binary → 1 file-unit (no line split)."""
    if isinstance(before, bytes) or isinstance(after, bytes):
        # ponytail: binary has no lines; 1 = one opaque file changed.
        if before and not after:
            return 0, 1
        if after and not before:
            return 1, 0
        if before != after:
            return 1, 1
        return 0, 0
    a = (before or "").splitlines()
    b = (after or "").splitlines()
    added = 0
    removed = 0
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(a=a, b=b, autojunk=False).get_opcodes():
        if tag == "insert":
            added += j2 - j1
        elif tag == "delete":
            removed += i2 - i1
        elif tag == "replace":
            removed += i2 - i1
            added += j2 - j1
    return added, removed


def _diff_preview(before: str | bytes | None, after: str | bytes | None, path: str) -> list[dict]:
    """Compact unified-ish preview for the widget."""
    if isinstance(before, bytes) or isinstance(after, bytes):
        removed = [f"(binary, {len(before)} bytes)"] if before else []
        added = [f"(binary, {len(after)} bytes)"] if after else []
        if not removed and not added:
            return []
        return [{"path": path, "removed": removed, "added": added}]
    a = (before or "").splitlines()
    b = (after or "").splitlines()
    removed: list[str] = []
    added: list[str] = []
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(a=a, b=b, autojunk=False).get_opcodes():
        if tag in {"delete", "replace"}:
            removed.extend(a[i1:i2])
        if tag in {"insert", "replace"}:
            added.extend(b[j1:j2])
        if len(removed) + len(added) >= _MAX_DIFF_LINES:
            break
    if not removed and not added:
        return []
    return [{
        "path": path,
        "removed": removed[:40],
        "added": added[:40],
    }]


@dataclass
class TurnChangeTracker:
    host_root: Path
    turn_id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])
    # Relative path → original content (None = did not exist; bytes = binary).
    _before: dict[str, str | bytes | None] = field(default_factory=dict)
    _touched: set[str] = field(default_factory=set)
    # Paths already restored by undo_file (still listed in summary as undone).
    _restored: set[str] = field(default_factory=set)
    # Last known status/stats/diff for a path after its snapshot was cleared.
    _file_meta: dict[str, dict] = field(default_factory=dict)
    created_at: float = field(default_factory=time.time)
    undone: bool = False

    def _rel(self, path: str) -> str | None:
        raw = (path or "").strip()
        if not raw:
            return None
        root = self.host_root.resolve()
        candidate = (root / raw).resolve() if not Path(raw).is_absolute() else Path(raw).resolve()
        try:
            return str(candidate.relative_to(root)).replace("\\", "/")
        except ValueError:
            return None

    def _abs(self, rel: str) -> Path:
        return (self.host_root / rel).resolve()

    def _read(self, abs_path: Path, *, for_snapshot: bool = False):
        if not abs_path.is_file():
            return None
        try:
            data = abs_path.read_bytes()
        except OSError:
            return _SKIP if for_snapshot else None
        if len(data) > _MAX_SNAPSHOT_BYTES:
            return _SKIP if for_snapshot else None
        try:
            return data.decode("utf-8")
        except UnicodeDecodeError:
            return data  # binary snapshot (bytes)

    def snapshot_before(self, path: str) -> None:
        """Capture pre-edit content once per path in this turn."""
        rel = self._rel(path)
        if not rel or rel in self._before:
            return
        content = self._read(self._abs(rel), for_snapshot=True)
        if content is _SKIP:
            return  # too large
        self._before[rel] = content

    def seed_before(self, path: str, content: str | bytes | None) -> None:
        """Set first-write snap without reading disk (Cursor completed events)."""
        rel = self._rel(path)
        if not rel or rel in self._before:
            return
        self._before[rel] = content

    def mark_touched(self, path: str) -> None:
        rel = self._rel(path)
        if not rel:
            return
        if rel not in self._before:
            self.snapshot_before(path)
            if rel not in self._before:
                return  # skipped (too large) or race
        self._touched.add(rel)

    def _file_entry(self, rel: str) -> dict | None:
        """Build one file row; uses cached meta once snapshot was cleared after undo."""
        file_undone = self.undone or rel in self._restored
        before = self._before.get(rel, _SKIP)
        if before is _SKIP:
            meta = self._file_meta.get(rel)
            if not meta:
                return None
            return {**meta, "undone": True, "undoable": False}
        after = None if file_undone else self._read(self._abs(rel))
        # After restore, disk matches before — keep pre-undo stats for the card.
        if file_undone:
            meta = self._file_meta.get(rel)
            if meta:
                return {**meta, "undone": True, "undoable": False}
            after = self._read(self._abs(rel))  # fallback
        if before is None and after is None:
            return None
        if before is None:
            status = "created"
        elif after is None:
            status = "deleted"
        else:
            status = "modified"
        additions, deletions = _line_stats(before, after)
        entry = {
            "path": rel,
            "status": status,
            "additions": additions,
            "deletions": deletions,
            "diff": _diff_preview(before, after, rel),
            "undone": file_undone,
            "undoable": not file_undone,
        }
        return entry

    def summary(self) -> dict:
        files: list[dict] = []
        total_add = 0
        total_del = 0
        active = 0
        for rel in sorted(self._touched):
            entry = self._file_entry(rel)
            if not entry:
                continue
            files.append(entry)
            if not entry.get("undone"):
                active += 1
                total_add += int(entry.get("additions") or 0)
                total_del += int(entry.get("deletions") or 0)
        return {
            "type": "turn_changes",
            "turn_id": self.turn_id,
            "files": files,
            "file_count": len(files),
            "additions": total_add,
            "deletions": total_del,
            "undoable": active > 0 and not self.undone,
            "undone": self.undone or (bool(files) and active == 0),
        }

    def _restore_one(self, rel: str) -> None:
        """Restore one path from first-write snapshot. Raises OSError on I/O failure."""
        if rel not in self._before:
            raise FileNotFoundError(f"no snapshot for {rel}")
        # Freeze card stats before disk matches the snapshot (else +0/-0).
        entry = self._file_entry(rel)
        if entry:
            self._file_meta[rel] = {
                "path": rel,
                "status": entry["status"],
                "additions": entry["additions"],
                "deletions": entry["deletions"],
                "diff": entry["diff"],
            }
        before = self._before[rel]
        target = self._abs(rel)
        if before is None:
            if target.is_file():
                target.unlink()
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            if isinstance(before, bytes):
                target.write_bytes(before)
            else:
                target.write_text(before, encoding="utf-8")
        # ponytail: drop snapshot after restore; meta keeps the card.
        self._before.pop(rel, None)
        self._restored.add(rel)

    def undo_file(self, path: str) -> dict:
        """Restore a single path; clear its snapshot after success."""
        if self.undone:
            return {"ok": False, "error": "already undone", **self.summary()}
        rel = self._rel(path)
        if not rel or rel not in self._touched:
            return {"ok": False, "error": "file not in this turn", **self.summary()}
        if rel in self._restored:
            return {"ok": False, "error": "file already undone", **self.summary()}
        try:
            self._restore_one(rel)
        except OSError as err:
            return {"ok": False, "error": f"{rel}: {err}", **self.summary()}
        if self._restored >= self._touched:
            self.undone = True
        out = self.summary()
        out["ok"] = True
        out["restored"] = 1
        out["path"] = rel
        return out

    def undo(self) -> dict:
        if self.undone:
            return {"ok": False, "error": "already undone", **self.summary()}
        restored = 0
        errors: list[str] = []
        for rel in sorted(self._touched - self._restored):
            try:
                self._restore_one(rel)
                restored += 1
            except OSError as err:
                errors.append(f"{rel}: {err}")
        self.undone = True
        # Drop any leftover snapshots (failed paths keep theirs for retry).
        if not errors:
            self._before.clear()
        out = self.summary()
        out["ok"] = not errors
        out["restored"] = restored
        if errors:
            out["error"] = "; ".join(errors[:5])
        return out


def store_tracker(session, tracker: TurnChangeTracker) -> None:
    bag = getattr(session, "undo_turns", None)
    if bag is None:
        session.undo_turns = {}
        bag = session.undo_turns
    bag[tracker.turn_id] = tracker
    # Keep last N turns only.
    if len(bag) > _MAX_UNDO_TURNS:
        for key in list(bag.keys())[: len(bag) - _MAX_UNDO_TURNS]:
            bag.pop(key, None)


def get_tracker(session, turn_id: str) -> TurnChangeTracker | None:
    bag = getattr(session, "undo_turns", None) or {}
    return bag.get(turn_id)


def demo() -> None:
    import tempfile

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "a.txt").write_text("one\ntwo\n", encoding="utf-8")
        tr = TurnChangeTracker(root)
        tr.snapshot_before("a.txt")
        (root / "a.txt").write_text("one\nthree\n", encoding="utf-8")
        tr.mark_touched("a.txt")
        tr.snapshot_before("b.txt")
        (root / "b.txt").write_text("new\n", encoding="utf-8")
        tr.mark_touched("b.txt")
        (root / "c.txt").write_text("x\ny\nz\n", encoding="utf-8")
        tr.snapshot_before("c.txt")
        (root / "c.txt").unlink()
        tr.mark_touched("c.txt")
        s = tr.summary()
        assert s["file_count"] == 3, s
        deleted = [f for f in s["files"] if f["status"] == "deleted"]
        assert deleted and deleted[0]["deletions"] == 3 and deleted[0]["additions"] == 0, deleted
        assert s["undoable"]
        # Per-file undo + snapshot cleanup.
        u1 = tr.undo_file("b.txt")
        assert u1["ok"] and not (root / "b.txt").exists(), u1
        assert "b.txt" not in tr._before
        assert any(f["path"] == "b.txt" and f["undone"] for f in u1["files"]), u1
        assert u1["undoable"] and not u1["undone"]
        u = tr.undo()
        assert u["ok"]
        assert (root / "a.txt").read_text(encoding="utf-8") == "one\ntwo\n"
        assert not (root / "b.txt").exists()
        assert (root / "c.txt").read_text(encoding="utf-8") == "x\ny\nz\n"
        assert not tr._before

        # Binary delete counts as -1 (not +0/-0).
        tr2 = TurnChangeTracker(root)
        (root / "blob.bin").write_bytes(b"\x00\x01\xff\xfe")
        tr2.snapshot_before("blob.bin")
        (root / "blob.bin").unlink()
        tr2.mark_touched("blob.bin")
        s2 = tr2.summary()
        assert s2["deletions"] == 1 and s2["files"][0]["status"] == "deleted", s2
        assert tr2.undo()["ok"]
        assert (root / "blob.bin").read_bytes() == b"\x00\x01\xff\xfe"
        print("turn_changes demo ok")

if __name__ == "__main__":
    demo()
