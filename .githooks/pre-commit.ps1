# Pre-commit hook for Windows (PowerShell)
# Runs line-count check, cargo clippy, CPD duplicate detection, and rustfmt

# Get the directory of this script
$scriptDir = Split-Path -Parent $PSCommandPath

Write-Host "Checking file line counts..." -ForegroundColor Cyan
pwsh -NoProfile -ExecutionPolicy Bypass -File "$scriptDir\check-line-count.ps1"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Line count check failed (exit code $LASTEXITCODE). Commit aborted." -ForegroundColor Red
    exit $LASTEXITCODE
}
Write-Host "Line count check passed." -ForegroundColor Green

Write-Host "Running cargo clippy..." -ForegroundColor Cyan
cargo clippy --all-targets --all-features -- -D warnings
if ($LASTEXITCODE -ne 0) {
    Write-Host "cargo clippy failed (exit code $LASTEXITCODE). Commit aborted." -ForegroundColor Red
    exit $LASTEXITCODE
}
Write-Host "cargo clippy passed." -ForegroundColor Green

Write-Host "Running PMD CPD..." -ForegroundColor Cyan
pwsh -NoProfile -ExecutionPolicy Bypass -File ./run-cpd.ps1
$CPD_EXIT = $LASTEXITCODE
if ($CPD_EXIT -eq 4) {
    Write-Host "PMD CPD found code duplicates (exit code $CPD_EXIT). Commit aborted." -ForegroundColor Red
    exit 1
}
elseif ($CPD_EXIT -ne 0) {
    Write-Host "PMD CPD failed (exit code $CPD_EXIT). Commit aborted." -ForegroundColor Red
    exit $CPD_EXIT
}
Write-Host "PMD CPD passed." -ForegroundColor Green

Write-Host "Running rustfmt..." -ForegroundColor Cyan
cargo fmt --all -- --check
if ($LASTEXITCODE -ne 0) {
    Write-Host "rustfmt check failed. Running formatter..." -ForegroundColor Yellow
    cargo fmt --all
    Write-Host "rustfmt applied formatting. Please review and stage changes." -ForegroundColor Yellow
    exit 1
}
Write-Host "rustfmt passed." -ForegroundColor Green

Write-Host "All pre-commit checks passed!" -ForegroundColor Green
exit 0
