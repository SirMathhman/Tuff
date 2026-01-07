#!/usr/bin/env python3
"""
Check that no directory contains more than N files (default 10). Ignores `node_modules`.
Exit code 0 on success, 1 on failure.

Usage:
  python scripts/check_dir_file_count.py [root] [--max N]
"""
import os
import sys
import argparse


def parse_args():
    p = argparse.ArgumentParser(description="Check directories for file count")
    p.add_argument("root", nargs="?", default=".", help="Root directory to scan")
    p.add_argument(
        "--max", "-m", type=int, default=10, help="Maximum allowed files per directory"
    )
    p.add_argument(
        "--ignore",
        "-i",
        action="append",
        default=["node_modules", ".git", "dist"],
        help="Directory names to ignore (repeatable)",
    )
    return p.parse_args()


def main():
    args = parse_args()
    offenders = []

    for dirpath, dirnames, filenames in os.walk(args.root):
        # skip ignored directories immediately
        dirnames[:] = [d for d in dirnames if d not in args.ignore]
        # Filter out compiled TypeScript files (.js and .d.ts) to count only source files
        source_files = [
            f for f in filenames if not f.endswith(".js") and not f.endswith(".d.ts")
        ]
        file_count = len(source_files)
        if file_count > args.max:
            offenders.append((dirpath, file_count, source_files))

    if not offenders:
        print(f"OK: no directories with more than {args.max} files under '{args.root}'")
        return 0

    print(f"Found {len(offenders)} directories exceeding {args.max} files:")
    for path, count, files in offenders:
        print(f"- {path}: {count} files")
        sample = files[:20]
        for f in sample:
            print(f"    {f}")
        if len(files) > len(sample):
            print(f"    ... and {len(files)-len(sample)} more files")

    return 1


if __name__ == "__main__":
    sys.exit(main())
