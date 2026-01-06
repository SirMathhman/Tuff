#!/usr/bin/env python3
"""
Simple check for maximum number of parameters in function definitions.
Usage: python scripts/check_param_count.py [max_params] [paths...]
Default max_params: 3
Default paths: src tests
"""
import re
import sys
from pathlib import Path


def count_params(param_str: str) -> int:
    s = param_str.strip()
    if s == "" or s == "void":
        return 0
    # Remove parameter attributes like 'int (*f)(int, int)' - naive: remove nested parentheses content
    # We'll replace any parentheses inside params with nothing for counting commas safely
    depth = 0
    out = []
    for ch in s:
        if ch == "(":
            depth += 1
            out.append(" ")
        elif ch == ")":
            if depth > 0:
                depth -= 1
            out.append(" ")
        else:
            if depth == 0:
                out.append(ch)
            else:
                out.append(" ")
    cleaned = "".join(out)
    parts = [p.strip() for p in cleaned.split(",") if p.strip()]
    return len(parts)


def find_excessive_params_in_file(path: Path, max_params: int):
    src = path.read_text()
    # Regex: match function definitions (return_type name(params) { )
    # This is a heuristic and will skip prototypes (ending with ;) and macros.
    pattern = re.compile(
        r"(^|\n)[\t ]*([a-zA-Z_][a-zA-Z0-9_\s\*]*?)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^;{}]*)\)\s*\{",
        re.M,
    )
    for m in pattern.finditer(src):
        ret = m.group(2)
        name = m.group(3)
        params = m.group(4)
        cnt = count_params(params)
        if cnt > max_params:
            # Determine line number
            start = m.start(0)
            line_no = src.count("\n", 0, start) + 1
            yield (path, line_no, name, cnt)


def main(argv):
    if len(argv) >= 2:
        try:
            max_params = int(argv[1])
            rest = argv[2:]
        except ValueError:
            max_params = 3
            rest = argv[1:]
    else:
        max_params = 3
        rest = []
    paths = rest if rest else ["src", "tests"]
    bad = []
    for p in paths:
        for path in Path(p).rglob("*.c"):
            for item in find_excessive_params_in_file(path, max_params):
                bad.append(item)
    if bad:
        for path, line_no, name, cnt in bad:
            print(
                f"{path}:{line_no}: function '{name}' has {cnt} parameters (max allowed {max_params})"
            )
        print(f"Found {len(bad)} function(s) exceeding {max_params} parameters")
        sys.exit(1)
    print("No functions exceeding parameter count")


if __name__ == "__main__":
    main(sys.argv)
