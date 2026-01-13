# Tuff

## Running tests (Windows)

- `make test`

The test runner is wrapped with a timeout to avoid hangs.

- Override per run: `make test TEST_TIMEOUT_SECS=5`
- Default timeout constant lives in `scripts/run_tests.ps1` (`$DefaultTimeoutSeconds`).
