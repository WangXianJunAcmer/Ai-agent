"""Discover project Agent Skills (Cursor + .claude/.codex compatibility paths)."""

from __future__ import annotations

import os
from pathlib import Path

import yaml

_SKILL_PARENTS = frozenset(
    {
        (".cursor", "skills"),
        (".agents", "skills"),
        (".claude", "skills"),
        (".codex", "skills"),
    }
)
_SKIP_DIRS = frozenset(
    {
        ".git",
        "node_modules",
        "__pycache__",
        ".venv",
        "venv",
        "miniconda3",
        "dist",
        "build",
        ".tox",
    }
)


def _is_project_skill_md(path: Path) -> bool:
    parts = path.parts
    for i in range(len(parts) - 2):
        if (parts[i], parts[i + 1]) in _SKILL_PARENTS and parts[-1] == "SKILL.md":
            return True
    return False


def _parse_frontmatter(text: str) -> dict:
    if not text.startswith("---"):
        return {}
    end = text.find("\n---", 3)
    if end < 0:
        return {}
    try:
        data = yaml.safe_load(text[3:end]) or {}
    except yaml.YAMLError:
        return {}
    return data if isinstance(data, dict) else {}


def list_project_skills(host_root: Path | str) -> list[dict]:
    """Return unique skills as {name, description, path} sorted by name."""
    root = Path(host_root).resolve()
    if not root.is_dir():
        return []

    by_name: dict[str, dict] = {}
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in _SKIP_DIRS]
        if "SKILL.md" not in filenames:
            continue
        skill_md = Path(dirpath) / "SKILL.md"
        if not _is_project_skill_md(skill_md):
            continue
        try:
            text = skill_md.read_text(encoding="utf-8")
        except OSError:
            continue
        meta = _parse_frontmatter(text)
        folder = skill_md.parent.name
        name = str(meta.get("name") or folder).strip()
        if not name:
            continue
        desc = str(meta.get("description") or "").strip()
        try:
            rel = str(skill_md.relative_to(root)).replace("\\", "/")
        except ValueError:
            rel = str(skill_md)
        # First win; prefer shorter path (repo-root skills over nested dupes of same name).
        prev = by_name.get(name)
        if prev is None or len(rel) < len(prev["path"]):
            by_name[name] = {"name": name, "description": desc, "path": rel}

    return sorted(by_name.values(), key=lambda s: s["name"].lower())


def demo() -> None:
    import tempfile

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        skill = root / ".claude" / "skills" / "demo-skill"
        skill.mkdir(parents=True)
        (skill / "SKILL.md").write_text(
            "---\nname: demo-skill\ndescription: Demo skill for slash picker.\n---\n\n# Demo\n",
            encoding="utf-8",
        )
        (root / "readme.md").write_text("x\n", encoding="utf-8")
        nested = root / "apps" / "web" / ".cursor" / "skills" / "web-deploy"
        nested.mkdir(parents=True)
        (nested / "SKILL.md").write_text(
            "---\nname: web-deploy\ndescription: Deploy the web app.\n---\n\n# Deploy\n",
            encoding="utf-8",
        )
        skills = list_project_skills(root)
        names = [s["name"] for s in skills]
        assert names == ["demo-skill", "web-deploy"], names
        assert skills[0]["description"].startswith("Demo"), skills[0]
    print("skills demo ok")


if __name__ == "__main__":
    demo()
