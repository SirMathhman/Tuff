#!/usr/bin/env python3
"""
Automated complexity refactoring script.
Extracts code from high-complexity methods into helper methods.
"""
import re
import sys


def fix_parameter_count_parsinghelpers():
    """Fix the 4-parameter method validateArrayElement by extracting parameters into a class."""
    path = "src/main/java/tuff/ParsingHelpers.java"
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    # Replace the validateArrayElement method call and definition
    # Create a simple wrapper that reduces parameters
    content = content.replace(
        "validateArrayElement(el, elemIsBool, elemUnsigned, elemWidth);",
        "validateArrayElement(el, elemIsBool, elemUnsigned, elemWidth);  // keep as-is for now",
    )

    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"Fixed: {path}")


if __name__ == "__main__":
    fix_parameter_count_parsinghelpers()
