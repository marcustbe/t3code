#!/usr/bin/env python3
"""Rename user- and agent-visible "T3 Code" prose to "Ghost" in the fork.

Only touches non-comment lines. Wire values, ids, paths and names that other
software matches on are protected. Usage: rebrand.py <repo> [--apply]
"""
import re
import sys
from pathlib import Path

repo = Path(sys.argv[1])
apply = "--apply" in sys.argv

ROOTS = ["apps/server/src", "apps/web/src", "apps/desktop/src", "packages"]
SKIP_DIRS = {"node_modules", "dist", "snapShot", "contracts", "wsl"}
EXTS = {".ts", ".tsx"}

# Lines containing any of these stay as they are.
PROTECT = [
    "CODEX_CLIENT_NAME",
    "agent_name_hint",
    "V1_PROFILE_NAMES",
    "legacy:",
    "MARKER",
    "Name=T3",
    "T3 Code (Alpha)",
    "T3 Code (Dev)",
    'activate("T3 Code")',
    'Effect.succeed("T3 Code")',
    'textNode("T3 Code")',
    "GNOME",
    "SnapShot",
]

RULES = [
    (re.compile(r"<strong>T3</strong> Code"), "Ghost"),
    (re.compile(r"\bT3 Code(?! Design)\b"), "Ghost"),
    (re.compile(r"\bT3 (threads?|tools?|MCP|[Ss]erver|process|system footprint|operations|desktop|runtime)\b"), r"Ghost \1"),
    (re.compile(r"\bT3 (could|shows|wakes|keeps|answers)\b"), r"Ghost \1"),
    (re.compile(r"\bRestart T3 and\b"), "Restart Ghost and"),
    (re.compile(r"\bT3's (tools|prompt|own settings)\b"), r"Ghost's \1"),
]
COMMENT = re.compile(r"^\s*(//|\*|/\*)")

changed_files = 0
changed_lines = 0
for root in ROOTS:
    for path in (repo / root).rglob("*"):
        if path.suffix not in EXTS or any(p in SKIP_DIRS for p in path.parts):
            continue
        if root == "packages" and "/src/" not in str(path) and "/test/" not in str(path):
            continue
        text = path.read_text()
        if "T3" not in text:
            continue
        out = []
        n = 0
        for line in text.splitlines(keepends=True):
            if not COMMENT.match(line) and not any(p in line for p in PROTECT):
                new = line
                for rx, rep in RULES:
                    new = rx.sub(rep, new)
                if new != line:
                    n += 1
                    if not apply:
                        print(f"{path.relative_to(repo)}: {new.strip()[:160]}")
                    line = new
            out.append(line)
        if n:
            changed_files += 1
            changed_lines += n
            if apply:
                path.write_text("".join(out))
print(f"{changed_lines} lines in {changed_files} files{' (applied)' if apply else ''}", file=sys.stderr)
