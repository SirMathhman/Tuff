#requires -Version 7
$ErrorActionPreference = 'Stop'

# Lint with clippy, treating warnings as errors.
cargo clippy --all-targets -- -D warnings
if ($LASTEXITCODE -ne 0) {
    Write-Error "cargo clippy reported issues"
    exit 1
}
exit 0
