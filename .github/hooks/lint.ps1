# Hook: lint via the TypeScript compiler (strict type check).
Set-Location (Resolve-Path (Join-Path $PSScriptRoot "..\.."))

& bunx tsc --noEmit
if ($LASTEXITCODE -ne 0) {
    Write-Error "Lint (type check) failed."
    exit 1
}
Write-Host "Lint passed."
