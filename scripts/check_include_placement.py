#!/usr/bin/env python3
"""
Check that all #include directives occur at the top of the file (after an optional header comment and blank lines), and that no #include appears after code.
Usage: python scripts/check_include_placement.py [paths...]
Defaults to: src include tests
Exit codes: 0 ok, 1 violations found
"""
import sys
import re
from pathlib import Path

paths = sys.argv[1:] if len(sys.argv) > 1 else ["src", "include", "tests"]
include_re = re.compile(r"^\s*#\s*include\b")
comment_re = re.compile(r"^\s*(//|/\*|\*|\*/).*")

violations = []
for p in paths:
    path = Path(p)
    if path.is_file():
        files = [path]
    else:
        files = list(path.rglob("*.c")) + list(path.rglob("*.h"))
    for f in files:
        try:
            s = f.read_text(encoding="utf-8")
        except Exception as e:
            print(f"Skipping {f}: {e}")
            continue
        lines = s.splitlines()
        seen_code = False
        for i, line in enumerate(lines, start=1):
            if line.strip() == "":
                continue
            if comment_re.match(line):
                # allow comment lines at top
                continue
            if include_re.match(line):
                if seen_code:
                    violations.append((str(f), i, line.strip()))
                # includes before code are fine
                continue
            if line.lstrip().startswith('#'):
                # allow other preprocessor directives (header guards, pragma once) before includes
                continue
            # first non-comment non-blank non-include non-preprocessor line is code
            seen_code = True
        # all good

if violations:
    print("Include placement violations (includes must appear before code):")
    for fn, ln, text in violations:
        print(f"{fn}:{ln}: {text}")
    sys.exit(1)

print("All includes are placed at the top of files")
sys.exit(0)
