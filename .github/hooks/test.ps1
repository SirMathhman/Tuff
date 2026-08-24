# Run the test suite with coverage and a per-test timeout.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root

bun test --timeout 10000 --coverage
exit $LASTEXITCODE
