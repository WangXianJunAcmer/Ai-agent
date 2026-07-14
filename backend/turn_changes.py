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


def _line_stats(before: str, after: str) -> tuple[int, int]:
    """Return (additions, deletions) via difflib opcodes."""
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


def _diff_preview(before: str, after: str, path: str) -> list[dict]:
    """Compact unified-ish preview for the widget."""
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
    # Relative path → original content (None = file did not exist).
    _before: dict[str, str | None] = field(default_factory=dict)
    _touched: set[str] = field(default_factory=set)
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
            return _SKIP if for_snapshot else None

    def snapshot_before(self, path: str) -> None:
        """Capture pre-edit content once per path in this turn."""
        rel = self._rel(path)
        if not rel or rel in self._before:
            return
        content = self._read(self._abs(rel), for_snapshot=True)
        if content is _SKIP:
            return  # untracked (too large / binary)
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

    def summary(self) -> dict:
        files: list[dict] = []
        total_add = 0
        total_del = 0
        for rel in sorted(self._touched):
            before = self._before.get(rel)
            after = self._read(self._abs(rel))
            if before is None and after is None:
                continue
            if before is None:
                status = "created"
            elif after is None:
                status = "deleted"
            else:
                status = "modified"
            additions, deletions = _line_stats(before or "", after or "")
            total_add += additions
            total_del += deletions
            files.append({
                "path": rel,
                "status": status,
                "additions": additions,
                "deletions": deletions,
                "diff": _diff_preview(before or "", after or "", rel),
            })
        return {
            "type": "turn_changes",
            "turn_id": self.turn_id,
            "files": files,
            "file_count": len(files),
            "additions": total_add,
            "deletions": total_del,
            "undoable": bool(files) and not self.undone,
            "undone": self.undone,
        }

    def undo(self) -> dict:
        if self.undone:
            return {"ok": False, "error": "already undone", **self.summary()}
        restored = 0
        errors: list[str] = []
        for rel in sorted(self._touched):
            before = self._before.get(rel)
            target = self._abs(rel)
            try:
                if before is None:
                    if target.is_file():
                        target.unlink()
                        restored += 1
                else:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_text(before, encoding="utf-8")
                    restored += 1
            except OSError as err:
                errors.append(f"{rel}: {err}")
        self.undone = True
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
        s = tr.summary()
        assert s["file_count"] == 2
        assert s["undoable"]
        u = tr.undo()
        assert u["ok"]
        assert (root / "a.txt").read_text(encoding="utf-8") == "one\ntwo\n"
        assert not (root / "b.txt").exists()
        print("turn_changes demo ok")


if __name__ == "__main__":
    demo()
