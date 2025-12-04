# Pre-Commit Hook: File Line Count Limit

## Overview

This pre-commit hook enforces a maximum line count of **500 lines** for any non-excluded file in the repository. This encourages modular code design and prevents files from becoming too large to maintain.

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

The hook is already configured in `.git/config` to use `.githooks` as the hooks directory:

```bash
git config --get core.hooksPath
# Output: .githooks
```

## Supported Platforms

### Windows

The hook runs automatically on commit using PowerShell:

```powershell
# Manual testing:
powershell -NoProfile -ExecutionPolicy Bypass -File ".githooks/pre-commit.ps1"
```

### Linux/macOS

The hook runs using bash:

```bash
# Manual testing:
bash .githooks/pre-commit
```

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

## Modifying the Limit

To change the 500-line limit, edit `.githooks/pre-commit.ps1` and `.githooks/pre-commit`:

Search for `MAX_LINES = 500` or `MAX_LINES=500` and update the value.

## Excluded Directories Configuration

To add or remove excluded directories, edit the `$EXCLUDED_DIRS` array in:

- `.githooks/pre-commit.ps1` (PowerShell version)
- `.githooks/pre-commit` (Bash version)

Example:

```powershell
$EXCLUDED_DIRS = @('target', '.git', '.githooks', 'node_modules', '.vscode', '.idea', 'dist', 'build')
```

## Rationale

Enforcing a maximum file size encourages:

1. **Modularity**: Breaking code into smaller, focused modules
2. **Maintainability**: Smaller files are easier to understand and modify
3. **Testability**: Focused modules are easier to test
4. **Reusability**: Well-scoped modules can be reused more easily
5. **Code Review**: Smaller files make pull request reviews more manageable

## Existing Large Files

Some files in the repository may exceed the 500-line limit from before this hook was added:

- `src/compiler/parser.rs` (703 lines) - Should be split into separate modules for parser phases

As the codebase evolves, these files should be refactored into smaller, focused modules to comply with this standard.
