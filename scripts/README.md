# Scripts Directory

This directory contains utility scripts for the Tuff interpreter project.

## pre-commit.ps1

**Purpose**: PowerShell-based pre-commit hook validation script.

**Responsibilities**:

- Runs the test suite (`./test.ps1`)
- Checks for code duplication using PMD (CPD)
- Reports results with colored output and progress indicators

**Features**:

- ✓ Structured error handling with Try-Catch-Finally
- ✓ Clear visual feedback (progress indicators, colors)
- ✓ Git root directory detection and automatic navigation
- ✓ Standard PowerShell practices ([StrictMode], proper error handling)

**Usage**:

```powershell
# Run directly
./scripts/pre-commit.ps1

# Run with custom git root
./scripts/pre-commit.ps1 -GitRoot "C:\path\to\repo"

# From git pre-commit hook (automatic)
# Invoked automatically when committing
```

**Exit Codes**:

- `0` - All checks passed
- `1` - Tests failed or duplication detected

## Git Hook Integration

The `.git/hooks/pre-commit` file is configured to delegate to `pre-commit.ps1`:

```bash
#!/bin/sh
# Pre-commit hook - Delegates to PowerShell script
GIT_ROOT="$(git rev-parse --show-toplevel)"
cd "$GIT_ROOT"

# Execute the pre-commit checks via PowerShell script
powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/pre-commit.ps1 -GitRoot "$GIT_ROOT"
exit $?
```

This approach:

- Keeps shell hook minimal (cross-platform shell compatibility)
- Delegates real logic to PowerShell (better for Windows development)
- Provides clear separation of concerns
- Makes testing and maintenance easier

## Adding More Scripts

To add additional scripts:

1. Create the `.ps1` file in this directory
2. Document its purpose and usage in this README
3. Consider whether it should be integrated into the git hook
