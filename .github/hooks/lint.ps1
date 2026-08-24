# Run ESLint over the project.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root

bun run lint
exit $LASTEXITCODE
