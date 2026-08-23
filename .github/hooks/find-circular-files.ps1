# Hook: detect circular dependencies between files using madge.
Set-Location (Resolve-Path (Join-Path $PSScriptRoot "..\.."))

$files = git ls-files "*.ts"
if (-not $files) {
    Write-Host "No TypeScript files to check."
    exit 0
}

& bunx madge --circular --extensions ts $files
if ($LASTEXITCODE -ne 0) {
    Write-Error "Circular dependency between files found. Move files or content appropriately."
    exit 1
}
Write-Host "No circular file dependencies."
