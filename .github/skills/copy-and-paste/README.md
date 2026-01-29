# Copy-Paste Utility

A Python utility for copying specific lines from one file and pasting them into another file at a specified location.

## Installation

No external dependencies required. Requires Python 3.6+.

## Usage

### Command Line

```bash
python copy_paste.py <source_path> <dest_path> <source_line> <line_count> <dest_line>
```

### Parameters

- `source_path`: Path to the source file to copy from
- `dest_path`: Path to the destination file to paste into
- `source_line`: 1-based line number in the source file where copying starts
- `line_count`: Number of lines to copy
- `dest_line`: 1-based line number in the destination file where content is inserted

### Python API

```python
from copy_paste import copy_paste

copy_paste(
    source_path="source.txt",
    dest_path="destination.txt",
    source_line=10,
    line_count=5,
    dest_line=20
)
```

## Examples

### Copy lines 5-9 from source.txt and insert at line 1 of dest.txt

```bash
python copy_paste.py source.txt dest.txt 5 5 1
```

### Copy line 50 from file1.py and insert at end of file2.py

If file2.py has 100 lines, insert at line 101:

```bash
python copy_paste.py file1.py file2.py 50 1 101
```

## Error Handling

The utility validates:

- Both files exist
- Line numbers are valid (1-based)
- Source line range doesn't exceed file length
- Destination line is within valid range (up to length + 1)

Invalid inputs raise descriptive error messages.

## Line Numbering

All line numbers are **1-based** (first line is line 1, not line 0).
