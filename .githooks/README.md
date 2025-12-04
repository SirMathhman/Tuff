# Pre-Commit Hook: File Line Count Limit

## Overview

This pre-commit hook enforces a maximum line count of **500 lines** for any non-excluded file in the repository. This encourages modular code design and prevents files from becoming too large to maintain.

## Implementation

The hook is implemented in **Python 3** for maximum portability and maintainability across all platforms (Windows, macOS, Linux).

### File

- `pre-commit` — Python script with shebang (executable on all platforms)

## Excluded Directories

The following directories are automatically excluded from the check:

- `target/` - Rust build artifacts
- `.git/` - Git metadata
- `.githooks/` - Git hooks directory
- `node_modules/` - npm dependencies
- `.vscode/` - VS Code settings
- `.idea/` - IDE settings
- Hidden files/directories (except `.gitignore`)

## Installation

```bash
# All platforms (Windows, macOS, Linux)
git config core.hooksPath .githooks
```

The hook will run automatically on every `git commit`.

**Requirements:**

- Python 3.6+ (automatically available on all platforms)
- Git 2.9+ (required for `core.hooksPath` support)

## Manual Testing

```bash
# All platforms
python3 .githooks/pre-commit
```

## Supported Platforms

The Python implementation runs identically on:

- **Windows** (PowerShell, Command Prompt, Git Bash)
- **macOS** (Terminal, iTerm2, etc.)
- **Linux** (bash, zsh, fish, etc.)

## Behavior

### Success

When all files are within the limit:

```
All files are within the 500 line limit.
# Commit proceeds
```

### Failure

When files exceed the limit, the commit is blocked:

```
Error: The following files exceed 500 lines:
  - src/compiler/parser.rs (800 lines)
  - src/compiler/codegen.rs (650 lines)
Please split large files into smaller modules.
```

## Bypassing the Hook

To bypass the hook temporarily (not recommended):

```bash
git commit --no-verify
```

## Modifying Configuration

To change settings, edit `.githooks/pre-commit`:

**Line Limit:**

```python
MAX_LINES = 500  # Change this value
```

**Excluded Directories:**

```python
EXCLUDED_DIRS = {"target", ".git", ".githooks", "node_modules", ".vscode", ".idea"}
```

Add or remove directories as needed.

## Rationale

Enforcing a maximum file size encourages:

1. **Modularity**: Breaking code into smaller, focused modules
2. **Maintainability**: Smaller files are easier to understand and modify
3. **Testability**: Focused modules are easier to test
4. **Reusability**: Well-scoped modules can be reused more easily
5. **Code Review**: Smaller files make pull request reviews more manageable

## Existing Large Files

Some files in the repository may exceed the 500-line limit from before this hook was added:

- `src/compiler/parser.rs` (814 lines) - Should be split into separate modules for parser phases

As the codebase evolves, these files should be refactored into smaller, focused modules to comply with this standard.

## How It Works

The hook checks **staged files only** (files in `git add` but not yet committed). This prevents new large files from entering the repository while allowing existing large files to remain until they're refactored. The hook:

1. Runs automatically before each `git commit`
2. Gets list of staged files via `git diff --cached`
3. Skips excluded directories and hidden files
4. Counts lines in each staged file
5. Reports any violations and blocks the commit

**Note:** To validate the hook on existing files, use `git add <file>` then `git commit` (the hook will check the staged version).
