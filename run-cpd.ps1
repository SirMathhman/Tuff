#!/usr/bin/env pwsh
# Run PMD CPD (Copy/Paste Detector) with minimum token count of 50

$pmdBin = Join-Path $PSScriptRoot "pmd-bin-7.9.0\bin\pmd.bat"
$sourceDir = Join-Path $PSScriptRoot "src"

Write-Host "Running PMD CPD on $sourceDir with minimum tokens: 50" -ForegroundColor Cyan

& $pmdBin cpd `
    --minimum-tokens 50 `
    --dir $sourceDir `
    --language rust `
    --format text

$exitCode = $LASTEXITCODE
if ($exitCode -eq 0) {
    Write-Host "`nCPD analysis completed successfully - no duplicates found!" -ForegroundColor Green
} elseif ($exitCode -eq 4) {
    Write-Host "`nCPD analysis completed - duplicates detected!" -ForegroundColor Yellow
} else {
    Write-Host "`nCPD analysis failed with exit code: $exitCode" -ForegroundColor Red
}

exit $exitCode
