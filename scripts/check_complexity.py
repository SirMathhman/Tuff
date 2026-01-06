#!/usr/bin/env python3
"""
Simple complexity checker using the `lizard` package.
Usage: python scripts/check_complexity.py [threshold] [paths...]
Defaults: threshold=15 paths=src include
Exit codes:
 0 - all functions <= threshold
 1 - lizard not installed
 2 - complexity violation(s) found
"""
import sys

THRESH = 15
if len(sys.argv) >= 2:
    try:
        THRESH = int(sys.argv[1])
    except ValueError:
        print("Invalid threshold, must be integer", file=sys.stderr)
        sys.exit(1)

paths = sys.argv[2:] if len(sys.argv) >= 3 else ["src", "include"]

try:
    import lizard
except ImportError:
    print(
        "The 'lizard' package is required. Install it with: pip install lizard",
        file=sys.stderr,
    )
    sys.exit(1)

res = lizard.analyze(paths)
violations = []
# lizard.analyze can return an iterator of file results or an object with function_list
for fileinfo in res:
    for f in getattr(fileinfo, "function_list", []):
        if f.cyclomatic_complexity > THRESH:
            violations.append(
                (fileinfo.filename, f.name, f.cyclomatic_complexity, f.start_line)
            )

# Some older lizard versions collect functions differently; try top-level function_list if present
if not violations and hasattr(res, "function_list"):
    for f in res.function_list:
        if f.cyclomatic_complexity > THRESH:
            violations.append(
                (f.filename, f.name, f.cyclomatic_complexity, f.start_line)
            )

if violations:
    print(f"Cyclomatic complexity violations (threshold = {THRESH}):", file=sys.stderr)
    for fn, name, cc, line in violations:
        print(f"{fn}:{line}: function '{name}' has complexity {cc}", file=sys.stderr)
    sys.exit(2)

print(f"No complexity violations (threshold = {THRESH})")
sys.exit(0)
