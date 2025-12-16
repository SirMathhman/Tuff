#!/usr/bin/env python3
"""
Add semicolons to all function declarations using => syntax.
Fixes: `fn name(...) => expr` to `fn name(...) => expr;`
"""

import re
import sys
from pathlib import Path


def fix_file(filepath: Path) -> bool:
    """Fix missing semicolons in a single file. Returns True if changes were made."""
    content = filepath.read_text(encoding="utf-8")
    original = content

    # Pattern to match function declarations with => but no semicolon
    # Matches both `fn` and `out fn` and `class fn` declarations
    # Pattern: (out\s+)?fn\s+\w+<...>?(...)\s*(:\s*[^=]+)?\s*=>\s*[^\s;].*$
    # But we need to be careful not to match lambda expressions

    # Strategy: Match lines that start with optional whitespace, then (out )?, then fn or class fn
    # Then match the rest until => and the expression, and if it doesn't end with semicolon, add one

    lines = content.split("\n")
    modified = False

    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.lstrip()

        # Check if this line looks like a function declaration start
        # (could be multi-line, so we need to handle continuation)
        if re.match(r"^(out\s+)?(class\s+)?fn\s+\w+", stripped):
            # Accumulate lines until we find the end of the declaration
            full_decl = line
            j = i + 1

            # Keep reading lines until we find a line that completes the declaration
            # (has => followed by the body)
            while j < len(lines) and "=>" not in full_decl:
                full_decl += "\n" + lines[j]
                j += 1

            # Now check if this declaration ends without a semicolon
            # after the => expression
            if "=>" in full_decl:
                # Find the => and everything after it
                arrow_pos = full_decl.rfind("=>")
                after_arrow = full_decl[arrow_pos + 2 :]

                # Check if the declaration is complete (not a block with { })
                # and doesn't end with semicolon
                # Skip if it's a lambda or if it's a block expression
                if "{" not in after_arrow:
                    # This is a single-expression body
                    # Check if it ends with a semicolon
                    trimmed = after_arrow.rstrip()
                    if (
                        trimmed
                        and not trimmed.endswith(";")
                        and not trimmed.endswith(",")
                    ):
                        # Add semicolon
                        # Find the last line
                        decl_lines = full_decl.split("\n")
                        last_line = decl_lines[-1]

                        # Add semicolon to the end
                        decl_lines[-1] = last_line.rstrip() + ";"

                        # Replace the lines
                        new_decl = "\n".join(decl_lines)
                        lines[i:j] = new_decl.split("\n")
                        modified = True

            # Skip to after this declaration
            i = j
        else:
            i += 1

    if modified:
        content = "\n".join(lines)
        filepath.write_text(content, encoding="utf-8")
        return True

    return False


def main():
    compiler_dir = Path("src/main/tuff/compiler")

    if not compiler_dir.exists():
        print(f"Error: {compiler_dir} not found")
        sys.exit(1)

    # Find all .tuff files
    tuff_files = list(compiler_dir.glob("**/*.tuff"))

    print(f"Found {len(tuff_files)} .tuff files")

    modified_count = 0
    for filepath in tuff_files:
        if fix_file(filepath):
            print(f"Fixed: {filepath}")
            modified_count += 1

    print(f"\nModified {modified_count} files")


if __name__ == "__main__":
    main()
