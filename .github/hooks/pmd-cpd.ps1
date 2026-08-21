# Detects copy-pasted code (duplications) in tracked TypeScript files using PMD CPD.
# PMD CPD prints duplicate blocks to stdout and exits 0 even when duplicates are
# found, so we treat any non-empty output as a failure.
$ErrorActionPreference = "Stop"

$files = git ls-files "*.ts"
if (-not $files) {
    exit 0
}

$output = pmd cpd --minimum-tokens 100 --language typescript @($files) 2>&1
if ($LASTEXITCODE -ne 0) {
    $output | Write-Error
    exit $LASTEXITCODE
}

if ($output -and ($output -join "`n").Trim()) {
    $output | Write-Error
    Write-Error "PMD CPD found duplicated code. Extract the duplication into a shared helper."
    exit 1
}
