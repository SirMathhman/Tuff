# Formats the codebase with Prettier (auto-fix), then verifies it is clean.
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))

bunx prettier --write .
if ($LASTEXITCODE -ne 0) {
    Write-Error 'Formatting failure.'
    exit 2
}
bunx prettier --check .
if ($LASTEXITCODE -ne 0) {
    Write-Error 'Formatting failure: files are still unformatted.'
    exit 2
}
