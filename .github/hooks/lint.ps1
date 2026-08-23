# Hook: lint via the TypeScript compiler (strict type check) and the size-limit linter.
Set-Location (Resolve-Path (Join-Path $PSScriptRoot "..\.."))

& bun run lint
if ($LASTEXITCODE -ne 0) {
    Write-Error "Lint (type check) failed."
    exit 1
}

& bun run scripts/check-size-limits.ts
if ($LASTEXITCODE -ne 0) {
    Write-Error "Lint (size limits) failed."
    exit 1
}
Write-Host "Lint passed."
