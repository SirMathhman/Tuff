# interpret stub project

This small project adds a stubbed C function `interpret(const char *input)` that returns a newly allocated string.

Build and run tests (requires gcc/make):

```sh
make test
```

Check for duplicated code using PMD CPD (minimum token count 60):

Shell:

```sh
scripts/check_duplicates.sh [min_tokens] [directory]
```

PowerShell:

```powershell
.\scripts\check_duplicates.ps1 -MinTokens 60 -Dir src/
```

This repository also includes a pre-commit hook that runs PMD CPD to block commits if duplicated code (>=60 tokens) is found.
