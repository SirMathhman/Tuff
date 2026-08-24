# Detect circular dependencies between files using madge.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root

bunx madge --circular --extensions js,ts .
exit $LASTEXITCODE
