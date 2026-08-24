# Detects circular dependencies between files using madge.
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))

bunx madge . --circular --extensions js,mjs,cjs,ts
$code = $LASTEXITCODE
if ($code -ne 0) {
    Write-Error 'Circular dependency between files found. Move files or content appropriately.'
    exit 2
}
