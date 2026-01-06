# PowerShell pre-commit hook: run make test, make lint, make format in that order
$ErrorActionPreference = 'Stop'
if (-not (Get-Command make -ErrorAction SilentlyContinue)) {
    Write-Host "make not found in PATH; skipping pre-commit checks"
    exit 0
}
Write-Host "Running pre-commit checks: test, lint, format"
& make precommit
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
