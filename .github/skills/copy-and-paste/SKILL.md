---
name: copy-and-paste
description: Python utility for copying specific lines from a source file and pasting them into a destination file at a specified location. Use this skill when you need to extract and relocate code snippets or text blocks between files.
---

## Overview

This skill provides a Python utility (`copy_paste.py`) that enables programmatic copying and pasting of lines between files. It's useful for automated code refactoring, file manipulation, and content reorganization tasks.

## When to Use

- Extracting reusable code blocks and inserting them into other files
- Automating repetitive copy-paste operations
- Building tools that need to move or duplicate lines of code
- Creating scripts that modify file structure programmatically

## Core Functionality

The `copy_paste()` function accepts:
- **source_path** (str): Path to the file to copy from
- **dest_path** (str): Path to the file to copy to
- **source_line** (int): 1-based line number in source file (where copying starts)
- **line_count** (int): Number of lines to copy
- **dest_line** (int): 1-based line number in destination file (insertion point)

## Usage

### Python API
```python
from copy_paste import copy_paste

# Copy 3 lines starting from line 10 in source.txt, 
# insert at line 5 in dest.txt
copy_paste("source.txt", "dest.txt", 10, 3, 5)
```

### Command Line
```bash
python copy_paste.py source.txt dest.txt 10 3 5
```

## Key Features

- **Validation**: Checks file existence and line range validity
- **1-based indexing**: Line numbers match editor conventions (line 1 is first)
- **Error handling**: Descriptive error messages for invalid inputs
- **No dependencies**: Pure Python 3.6+ implementation
- **Preserves formatting**: Maintains original line endings and spacing

## Example Scenarios

**Scenario 1**: Extract a function from one file and add it to another
```bash
python copy_paste.py utils.py main.py 50 8 15
```
Copies 8 lines starting from line 50 of utils.py, inserts at line 15 of main.py.

**Scenario 2**: Duplicate configuration from one file to another
```bash
python copy_paste.py config1.json config2.json 1 20 100
```
Copies first 20 lines of config1.json, inserts at line 100 of config2.json.

## Error Cases

- Source/destination file not found
- Line numbers < 1
- Source line range exceeds file length
- Destination line exceeds file length + 1
- Invalid input parameters