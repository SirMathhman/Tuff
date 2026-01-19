#!/usr/bin/env python3
"""
Pre-commit hook to enforce a maximum of 15 classes per Java package.
Scans all Java source files and groups them by package.
"""

import os
import re
import sys
from collections import defaultdict
from pathlib import Path


def extract_package_from_path(file_path):
    """Extract the package name from a Java file path."""
    # Convert path to package: src/main/java/io/github/sirmathhman/tuff/App.java -> io.github.sirmathhman.tuff
    parts = Path(file_path).parts
    try:
        java_index = parts.index("java")
        package_parts = parts[java_index + 1 : -1]  # Exclude 'java' dir and filename
        return ".".join(package_parts)
    except (ValueError, IndexError):
        return None


def check_package_class_limits(src_dir="src/main/java", max_classes=15):
    """
    Check that no package has more than max_classes Java files.
    One file = one class (following Java conventions).

    Returns:
        (is_valid, violations_list)
    """
    package_classes = defaultdict(list)

    # Find all Java files
    for root, dirs, files in os.walk(src_dir):
        for file in files:
            if file.endswith(".java"):
                file_path = os.path.join(root, file)
                package = extract_package_from_path(file_path)
                if package:
                    package_classes[package].append(file)

    # Check for violations
    violations = []
    for package, classes in sorted(package_classes.items()):
        if len(classes) > max_classes:
            violations.append(
                {"package": package, "count": len(classes), "classes": classes}
            )

    is_valid = len(violations) == 0
    return is_valid, violations


def main():
    """Main entry point for the pre-commit hook."""
    is_valid, violations = check_package_class_limits()

    if not is_valid:
        print(
            "❌ Package class limit violations detected (max 15 per package):\n",
            file=sys.stderr,
        )
        for violation in violations:
            print(f"Package: {violation['package']}", file=sys.stderr)
            print(f"  Classes: {violation['count']}", file=sys.stderr)
            for cls in sorted(violation["classes"]):
                print(f"    - {cls}", file=sys.stderr)
            print()
        return 1
    else:
        print("✓ All packages are within the 15-class limit")
        return 0


if __name__ == "__main__":
    sys.exit(main())
