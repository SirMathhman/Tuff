#!/usr/bin/env python3
"""Clean tuffc_lib.tuff by removing duplicate functions that are now in single_file_ops.tuff"""


def main():
    filepath = "src/main/tuff/compiler/tuffc_lib.tuff"

    with open(filepath, "r", encoding="utf-8") as f:
        lines = f.readlines()

    print(f"Original: {len(lines)} lines")

    # Add import after line 121 (after compile::lsp_check import)
    import_text = """
// Single-file compilation operations.
from compile::single_file_ops use {
  compile_tiny,
  compile_module,
  compile_tiny2_with_imported_fns,
  lint_tiny2_with_imported_fns,
  lint_tiny2_collect_with_imported_fns
};

"""

    # Insert import
    lines.insert(121, import_text)

    # Remove lines 195-601 (now 196-602 after insert)
    # compile_tiny2 starts at line 195 (0-indexed: 194)
    # Lines 602-619 already contain the section headers and compile_code/lint_code
    # Keep lines before 195 (0-indexed: 194) and from 602 (0-indexed: 601) onward
    new_lines = lines[:195]
    new_lines.extend(lines[602:])

    print(f"New: {len(new_lines)} lines")
    print(f"Removed: {len(lines) - len(new_lines)} lines")

    with open(filepath, "w", encoding="utf-8") as f:
        f.writelines(new_lines)

    print(f"✓ Cleaned {filepath}")


if __name__ == "__main__":
    main()
