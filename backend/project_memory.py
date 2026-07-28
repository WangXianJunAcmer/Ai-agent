"""Inject project rules + skill index into the agent system prompt.

# ponytail: plain file reads; SSH only loads root rule files (no full skill walk).
"""

from __future__ import annotations

from pathlib import Path

_RULE_FILES = (
    "AGENTS.md",
    "CLAUDE.md",
    ".coding-agent/rules.md",
    ".cursor/rules.md",
)
_MAX_RULE_CHARS = 12_000
_MAX_SKILLS = 40


def _read_local(root: Path, rel: str) -> str:
    path = root / rel
    if not path.is_file():
        return ""
    try:
        return path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return ""


def _read_ssh(host_id: str, remote: str, rel: str) -> str:
    try:
        from backend.ssh_workspace import read_file as ssh_read

        data = ssh_read(host_id, remote, rel)
        return str(data.get("content") or "")
    except Exception:
        return ""


def load_rule_files(host_root) -> list[tuple[str, str]]:
    """Return [(rel_path, text), ...] for present rule files (capped)."""
    from backend.ssh_workspace import is_ssh_uri, parse_ssh_uri

    raw = str(host_root or "")
    out: list[tuple[str, str]] = []
    budget = _MAX_RULE_CHARS

    if is_ssh_uri(raw):
        host_id, remote = parse_ssh_uri(raw)
        reader = lambda rel: _read_ssh(host_id, remote, rel)
    else:
        root = Path(raw).resolve()
        if not root.is_dir():
            return []
        reader = lambda rel: _read_local(root, rel)

    for rel in _RULE_FILES:
        if budget <= 0:
            break
        text = (reader(rel) or "").strip()
        if not text:
            continue
        if len(text) > budget:
            text = text[:budget] + "\n… truncated"
        out.append((rel, text))
        budget -= len(text)
    return out


def skills_index_block(host_root) -> str:
    """Short skill catalog for the system prompt (local workspace only)."""
    from backend.ssh_workspace import is_ssh_uri
    from backend.skills import list_project_skills

    if is_ssh_uri(str(host_root or "")):
        return ""
    try:
        skills = list_project_skills(host_root)[:_MAX_SKILLS]
    except Exception:
        return ""
    if not skills:
        return ""
    lines = ["Project skills (read SKILL.md via read_file when relevant):"]
    for s in skills:
        desc = (s.get("description") or "").strip().replace("\n", " ")
        if len(desc) > 160:
            desc = desc[:160] + "…"
        lines.append(f"- {s['name']}: {desc} ({s['path']})" if desc else f"- {s['name']} ({s['path']})")
    return "\n".join(lines)


def project_memory_block(host_root) -> str:
    """Combined rules + skills text for system prompt (may be empty)."""
    parts: list[str] = []
    for rel, text in load_rule_files(host_root):
        parts.append(f"### {rel}\n{text}")
    skills = skills_index_block(host_root)
    if skills:
        parts.append(skills)
    if not parts:
        return ""
    return "Project instructions (follow when relevant):\n\n" + "\n\n".join(parts)


def demo() -> None:
    import tempfile

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "AGENTS.md").write_text("# Agents\nUse pytest.\n", encoding="utf-8")
        skill = root / ".claude" / "skills" / "demo"
        skill.mkdir(parents=True)
        (skill / "SKILL.md").write_text(
            "---\nname: demo\ndescription: Demo skill.\n---\n\n# Demo\n",
            encoding="utf-8",
        )
        block = project_memory_block(root)
        assert "AGENTS.md" in block and "Use pytest" in block, block
        assert "demo" in block and "Demo skill" in block, block
    print("project_memory demo ok")


if __name__ == "__main__":
    demo()
