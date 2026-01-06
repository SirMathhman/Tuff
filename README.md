# Tuff — interpret stub

This adds a stub C function `interpret(const char *s)` that currently returns -1 and a minimal test runner.

How to build & run tests (Windows PowerShell):

```powershell
# Using the provided script (requires gcc in PATH)
powershell -ExecutionPolicy Bypass -File .\build_and_run_tests.ps1

# Or using make (if available)
make test
```

The test runner (`tests/test_interpret.c`) currently asserts that the stub returns -1 for several inputs. Replace or add tests when you provide desired behavior and I'll implement it.
