# interpret stub project

This small project adds a stubbed C function `interpret(const char *input)` that returns a newly allocated string.

Build and run tests (PowerShell):

```powershell
.\scripts\build_and_test.ps1    # uses clang or gcc if available
```

Or on \*nix / CI runners:

```sh
./scripts/run_tests.sh          # uses $CC or clang/gcc
```

Check for duplicated code using PMD CPD (minimum token count 60):

PowerShell (preferred):

```powershell
.\scripts\check_duplicates.ps1 -MinTokens 60 -Dir src/
```

Check cyclomatic complexity (maximum 15 per function):

```powershell
.\scripts\check_complexity.ps1 -MaxComplexity 15 -Dir src/
```

This repository also includes a pre-commit hook that runs:

- **Build & tests** to block commits if compilation or tests fail
- PMD CPD to block commits if duplicated code (>=60 tokens) is found
- Cyclomatic complexity checks to block commits if any function exceeds complexity 15

Preferred: PowerShell-only tooling where possible on this repo.
