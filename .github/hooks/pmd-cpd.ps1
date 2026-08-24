# Run PMD CPD to detect copy-pasted code. Exits non-zero if duplicates are found.
$ErrorActionPreference = "Stop"
Set-Location (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent)

$files = Get-ChildItem -Path . -Filter *.c -Recurse -File
if (-not $files) { exit 0 }

& pmd cpd --minimum-tokens 50 --language cpp --dir .
if ($LASTEXITCODE -ne 0) {
    Write-Error "PMD CPD found duplicated code."
    exit 1
}
