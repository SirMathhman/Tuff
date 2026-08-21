# Detects circular dependencies between TypeScript files using madge.
# madge exits non-zero and prints each cycle when one is found.
$ErrorActionPreference = "Stop"

$files = git ls-files "*.ts"
if (-not $files) {
    exit 0
}

$output = bunx madge --circular --extensions ts . 2>&1
if ($LASTEXITCODE -ne 0) {
    $output | Write-Error
    Write-Error "Circular dependency between files found. Move files or content appropriately."
    exit 1
}
