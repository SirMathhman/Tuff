# Auto-fix formatting with Prettier (fails only on parse errors).
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root

bunx prettier --write .
exit $LASTEXITCODE
