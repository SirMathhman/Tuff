# Hook: detect copy-pasted code blocks with PMD CPD.
Set-Location (Resolve-Path (Join-Path $PSScriptRoot "..\.."))

$files = git ls-files "*.ts" | Where-Object { $_ -notlike "node_modules/*" }
if (-not $files) {
    Write-Host "No TypeScript files to check."
    exit 0
}

& pmd cpd --minimum-tokens 100 --language typescript $files
if ($LASTEXITCODE -ne 0) {
    Write-Error "Duplicated code detected. Extract the duplicated blocks."
    exit 1
}
Write-Host "No duplicated code detected."
