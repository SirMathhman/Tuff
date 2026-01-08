# Quality Check Configuration

## Overview
The project is configured with a comprehensive quality check system that ensures code quality standards are maintained through automated checks at commit time.

## Check Scripts

### Available Scripts
- `npm run test` - Run all unit tests using Vitest
- `npm run cpd` - Check for code duplication using PMD CPD
- `npm run lint` - Check code style and quality using ESLint
- `npm run check` - Run all three checks in sequence (test && cpd && lint)

## Exit Code Behavior

All check scripts are configured to return non-zero exit codes when errors are found:

- **Zero (0)**: All checks passed successfully
- **Non-zero (1, 2, 4, etc.)**: One or more checks failed
  - Test failure returns code 1
  - CPD (duplication check) failure returns code 1
  - Lint failure returns code 1
  - Combined failures propagate the error code through the chain

## Command Chaining

The `check` script uses the `&&` operator to chain all three checks:
```bash
npm run test && npm run cpd && npm run lint
```

This ensures:
1. **Short-circuit evaluation**: If any check fails, subsequent checks are skipped
2. **Error propagation**: The final exit code reflects whether all checks passed
3. **Early feedback**: Developers immediately see which check failed

## Pre-commit Hook Integration

The `.husky/pre-commit` hook automatically runs:
```bash
npm run check
```

This prevents commits when:
- Tests fail
- Code duplication is detected
- Linting errors are found

To commit successfully, all three checks must pass.

## Configuration Details

### Vitest (test)
- **Config**: Uses default Vitest configuration
- **Test File**: `tests/interpret.test.ts`
- **Exit Code**: Non-zero on test failure

### PMD CPD (cpd)
- **Minimum Tokens**: 50 (detects duplication blocks with 50+ tokens)
- **Ignore**: Literal values and identifiers
- **Language**: TypeScript
- **Scope**: `src/` and `tests/` directories
- **Exit Code**: Non-zero when duplicates are found

### ESLint (lint)
- **Config**: `eslint.config.cjs`
- **Extensions**: `.ts` files only
- **Scope**: `src/` and `tests/` directories  
- **Exit Code**: Non-zero when lint errors are found

## Usage

### Run all checks
```bash
npm run check
```

### Run individual checks
```bash
npm run test
npm run cpd
npm run lint
```

### Check exit code (PowerShell)
```powershell
npm run check
echo "Exit code: $LASTEXITCODE"
```

### Check exit code (Bash)
```bash
npm run check
echo "Exit code: $?"
```
