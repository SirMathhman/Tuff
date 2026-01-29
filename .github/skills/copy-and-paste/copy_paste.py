#!/usr/bin/env python3
"""
Copy-paste utility for lines between files.

This utility extracts lines from a source file and inserts them into
a destination file at the specified locations.
"""

import sys
from pathlib import Path


def copy_paste(
    source_path: str,
    dest_path: str,
    source_line: int,
    line_count: int,
    dest_line: int,
) -> None:
    """
    Copy lines from source file and paste into destination file.

    Args:
        source_path: Path to the source file
        dest_path: Path to the destination file
        source_line: 1-based line number in source file to start copying
        line_count: Number of lines to copy
        dest_line: 1-based line number in destination where content is inserted

    Raises:
        FileNotFoundError: If source or destination file doesn't exist
        ValueError: If line numbers or counts are invalid
    """
    source_file = Path(source_path)
    dest_file = Path(dest_path)

    if not source_file.exists():
        raise FileNotFoundError(f"Source file not found: {source_path}")
    
    # Create destination file if it doesn't exist
    if not dest_file.exists():
        dest_file.parent.mkdir(parents=True, exist_ok=True)
        dest_file.touch()

    if source_line < 1:
        raise ValueError(f"Source line must be >= 1, got {source_line}")
    if line_count < 1:
        raise ValueError(f"Line count must be >= 1, got {line_count}")
    if dest_line < 1:
        raise ValueError(f"Destination line must be >= 1, got {dest_line}")

    # Read source file
    with open(source_file, "r", encoding="utf-8") as f:
        source_lines = f.readlines()

    # Validate source line range
    if source_line > len(source_lines):
        raise ValueError(
            f"Source line {source_line} exceeds file length ({len(source_lines)})"
        )
    if source_line + line_count - 1 > len(source_lines):
        raise ValueError(
            f"Cannot copy {line_count} lines starting from line {source_line} "
            f"(file has {len(source_lines)} lines)"
        )

    # Extract lines to copy (convert 1-based to 0-based indexing)
    lines_to_copy = source_lines[source_line - 1 : source_line - 1 + line_count]

    # Read destination file
    with open(dest_file, "r", encoding="utf-8") as f:
        dest_lines = f.readlines()

    # Validate destination line range
    if dest_line > len(dest_lines) + 1:
        raise ValueError(
            f"Destination line {dest_line} exceeds file length + 1 ({len(dest_lines) + 1})"
        )

    # Insert lines into destination (convert 1-based to 0-based indexing)
    dest_lines[dest_line - 1 : dest_line - 1] = lines_to_copy

    # Write destination file
    with open(dest_file, "w", encoding="utf-8") as f:
        f.writelines(dest_lines)


def main():
    """CLI interface for copy-paste utility."""
    if len(sys.argv) != 6:
        print(
            "Usage: copy_paste.py <source_path> <dest_path> "
            "<source_line> <line_count> <dest_line>"
        )
        print()
        print("Arguments:")
        print("  source_path  : Path to source file")
        print("  dest_path    : Path to destination file")
        print("  source_line  : 1-based line number in source file to start copying")
        print("  line_count   : Number of lines to copy")
        print("  dest_line    : 1-based line number in destination for insertion")
        sys.exit(1)

    try:
        source_path = sys.argv[1]
        dest_path = sys.argv[2]
        source_line = int(sys.argv[3])
        line_count = int(sys.argv[4])
        dest_line = int(sys.argv[5])

        copy_paste(source_path, dest_path, source_line, line_count, dest_line)
        print(
            f"Successfully copied {line_count} line(s) from {source_path}:{source_line} "
            f"to {dest_path}:{dest_line}"
        )
    except (ValueError, FileNotFoundError) as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
