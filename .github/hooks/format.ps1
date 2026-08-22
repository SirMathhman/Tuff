#requires -Version 7
$ErrorActionPreference = 'Stop'

# Auto-fix formatting, then verify it is clean.
cargo fmt
if ($LASTEXITCODE -ne 0) {
    Write-Error "cargo fmt failed"
    exit 1
}
cargo fmt --check
if ($LASTEXITCODE -ne 0) {
    Write-Error "code is not formatted after auto-fix"
    exit 1
}
exit 0
