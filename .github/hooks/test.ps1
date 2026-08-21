# Runs the test suite. Fails the hook if any test fails.
$ErrorActionPreference = "Stop"

bun test
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
