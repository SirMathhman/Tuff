#!/usr/bin/env python3
"""
Script to split interpret.test.ts into feature-level test files using the copy-paste utility.
"""
import sys
sys.path.insert(0, '/home/mathm/projects/Tuff/.github/skills/copy-and-paste')
from copy_paste import copy_paste
import os

# Source file
source = '/home/mathm/projects/Tuff/tests/interpret.test.ts'

# Test file mappings: (filename, sections) where sections = [(start_line, line_count), ...]
test_files = [
    # Basic tests (stub + basic numeric literal)
    ('basic.test.ts', [
        (1, 13),  # Import + basic stub tests + numeric literal
    ]),
    
    # Struct tests (including generics, type aliases, tuples)
    ('structs.test.ts', [
        (1, 2),   # Import
        (15, 135),  # All struct tests including generic structs and type aliases
    ]),
    
    # Array tests (indexing, slices, bounds, initialization)
    ('arrays.test.ts', [
        (1, 2),   # Import
        (152, 62),  # Array tests (from line 152 to around 213)
    ]),
    
    # Numeric types (suffixes, ranges, overflows, arithmetic with suffixes)
    ('numeric-types.test.ts', [
        (1, 2),   # Import
        (216, 116),  # Numeric suffixes tests (line 216 to around 331)
    ]),
    
    # Variables (declarations, mutability, assignment, type conversions)
    ('variables.test.ts', [
        (1, 2),   # Import
        (334, 56),  # Variable tests (line 334 to around 389)
    ]),
    
    # Boolean type and conditional expressions
    ('booleans.test.ts', [
        (1, 2),   # Import
        (392, 98),  # Bool, if/else, while loops (line 392 to around 489)
    ]),
    
    # Comparison and logical operators
    ('comparisons.test.ts', [
        (1, 2),   # Import
        (493, 51),  # Comparison and logical operators (line 493 to around 543)
    ]),
    
    # Pointers and references
    ('pointers.test.ts', [
        (1, 2),   # Import
        (546, 34),  # Pointer tests (line 546 to around 579)
    ]),
    
    # Basic functions
    ('functions.test.ts', [
        (1, 2),   # Import
        (582, 80),  # Function tests (line 582 to around 661)
    ]),
    
    # This context, function pointers, closures
    ('this-context.test.ts', [
        (1, 2),   # Import
        (664, 100),  # this notation tests (line 664 to around 763)
    ]),
    
    # Singleton objects
    ('objects.test.ts', [
        (1, 2),   # Import
        (766, 34),  # Object tests (line 766 to around 799)
    ]),
    
    # Char and string literals
    ('strings.test.ts', [
        (1, 2),   # Import
        (802, 19),  # Char/string tests (line 802 to around 820)
    ]),
    
    # Comments
    ('comments.test.ts', [
        (1, 2),   # Import
        (821, 20),  # Comment tests (line 821 to around 840)
    ]),
    
    # Method chaining and advanced this patterns
    ('method-chaining.test.ts', [
        (1, 2),   # Import
        (844, 136),  # Method chaining tests (line 844 to end at 979)
    ]),
]

def create_test_file(filename, sections):
    """Create a test file by copying multiple sections"""
    dest_path = f'/home/mathm/projects/Tuff/tests/{filename}'
    
    # Create empty file first
    with open(dest_path, 'w') as f:
        pass
    
    current_line = 1
    for start_line, line_count in sections:
        copy_paste(source, dest_path, start_line, line_count, current_line)
        current_line += line_count

def main():
    print("Splitting interpret.test.ts into feature-level test files...")
    
    for filename, sections in test_files:
        print(f"Creating {filename}...")
        create_test_file(filename, sections)
    
    print("\nAll test files created successfully!")
    print("\nCreated files:")
    for filename, _ in test_files:
        filepath = f'/home/mathm/projects/Tuff/tests/{filename}'
        lines = sum(1 for _ in open(filepath))
        print(f"  - {filename} ({lines} lines)")

if __name__ == '__main__':
    main()
