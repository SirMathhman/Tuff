#!/usr/bin/env python3
"""
Check that files under given directories are no longer than a given number of lines.
Usage: python scripts/check_file_length.py [max_lines] [paths...]
Defaults: max_lines=500, paths=['src','include','tests']
"""
import sys
from pathlib import Path


def main(argv):
    if len(argv) >= 2:
        try:
            max_lines = int(argv[1])
            rest = argv[2:]
        except ValueError:
            max_lines = 500
            rest = argv[1:]
    else:
        max_lines = 500
        rest = []
    paths = rest if rest else ["src", "include", "tests"]
    violations = []
    for p in paths:
        for path in Path(p).rglob("*"):
            if not path.is_file():
                continue
            if path.suffix not in [".c", ".h", ".cpp", ".hpp"]:
                continue
            try:
                with path.open("r", encoding="utf-8") as f:
                    lines = sum(1 for _ in f)
            except Exception as e:
                print(f"Could not read {path}: {e}")
                violations.append((str(path), -1))
                continue
            if lines > max_lines:
                violations.append((str(path), lines))
    if violations:
        for fn, ln in violations:
            if ln >= 0:
                print(f"{fn}: {ln} lines (max allowed {max_lines})", file=sys.stderr)
            else:
                print(f"{fn}: unreadable", file=sys.stderr)
        print(
            f"Found {len(violations)} file(s) exceeding {max_lines} lines",
            file=sys.stderr,
        )
        sys.exit(1)
    print("No files exceeding max line count")


if __name__ == "__main__":
    main(sys.argv)
