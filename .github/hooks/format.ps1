# Hook: verify formatting with Prettier (auto-fixable via `bunx prettier --write .`).
Set-Location (Resolve-Path (Join-Path $PSScriptRoot "..\.."))

& bunx prettier --check .
if ($LASTEXITCODE -ne 0) {
    Write-Error "Formatting check failed. Run `bunx prettier --write .` to auto-fix."
    exit 1
}
Write-Host "Formatting OK."
