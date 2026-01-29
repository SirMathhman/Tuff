#!/usr/bin/env python3
"""
Script to split interpret.test.ts into feature-level test files.
This version ensures complete test blocks are copied.
"""
import sys
sys.path.insert(0, '/home/mathm/projects/Tuff/.github/skills/copy-and-paste')
from copy_paste import copy_paste
import os
import re

source = '/home/mathm/projects/Tuff/tests/interpret.test.ts'

# Read the source file
with open(source, 'r') as f:
    lines = f.readlines()

# Find test boundaries
test_starts = []
for i, line in enumerate(lines, 1):
    if line.startswith("test('"):
        test_starts.append(i)

# Create test file mappings based on test names
# Format: (filename, start_test_index, end_test_index)
test_mappings = [
    ('basic.test.ts', 0, 2),  # Tests 0-2: stub tests + basic literal
    ('structs.test.ts', 3, 14),  # Tests 3-14: structs, generics, tuples, type aliases
    ('arrays.test.ts', 15, 26),  # Tests 15-26: arrays, slices, indexing
    ('numeric-types.test.ts', 27, 52),  # Tests 27-52: suffixes and arithmetic
    ('variables.test.ts', 53, 69),  # Tests 53-69: variable declarations and assignments
    ('booleans.test.ts', 70, 89),  # Tests 70-89: Bool type, if/else, while
    ('comparisons.test.ts', 90, 98),  # Tests 90-98: comparison and logical operators
    ('pointers.test.ts', 99, 107),  # Tests 99-107: pointers and references
    ('functions.test.ts', 108, 125),  # Tests 108-125: basic functions
    ('this-context.test.ts', 126, 147),  # Tests 126-147: this notation and function pointers
    ('objects.test.ts', 148, 153),  # Tests 148-153: singleton objects
    ('strings.test.ts', 154, 161),  # Tests 154-161: char and string literals
    ('comments.test.ts', 162, 166),  # Tests 162-166: comments
    ('method-chaining.test.ts', 167, None),  # Tests 167-end: method chaining and nested this
]

def create_test_file(filename, start_idx, end_idx):
    """Create a test file by copying a range of tests"""
    dest_path = f'/home/mathm/projects/Tuff/tests/{filename}'
    
    # Calculate line ranges
    # Import line is lines 1-2
    # Tests start at test_starts[start_idx]
    start_line = test_starts[start_idx]
    
    if end_idx is None:
        # Copy to end of file
        end_line = len(lines)
    else:
        # Copy up to (but not including) the next test
        end_line = test_starts[end_idx] - 1
    
    # Create empty file
    with open(dest_path, 'w') as f:
        pass
    
    # Copy import (lines 1-2)
    copy_paste(source, dest_path, 1, 2, 1)
    
    # Copy tests
    test_line_count = end_line - start_line + 1
    copy_paste(source, dest_path, start_line, test_line_count, 3)
    
    return dest_path

def main():
    print("Splitting interpret.test.ts into feature-level test files...")
    print(f"Found {len(test_starts)} tests in source file\n")
    
    for filename, start_idx, end_idx in test_mappings:
        print(f"Creating {filename}...")
        dest_path = create_test_file(filename, start_idx, end_idx)
        
        # Count lines and tests
        with open(dest_path, 'r') as f:
            lines_count = sum(1 for _ in f)
        
        test_count = (len(test_starts) - start_idx) if end_idx is None else (end_idx - start_idx)
        print(f"  → {test_count} tests, {lines_count} lines")
    
    print("\nAll test files created successfully!")

if __name__ == '__main__':
    main()
