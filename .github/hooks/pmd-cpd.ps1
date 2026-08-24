# Detects copy-pasted code blocks with PMD CPD.
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))

$files = Get-ChildItem -Recurse -File -Include *.js, *.mjs, *.cjs, *.ts | Where-Object { $_.FullName -notmatch '\\node_modules\\' }
if (-not $files) { exit 0 }
$files | ForEach-Object { $_.FullName } | Out-File -FilePath "$env:TEMP\pmd-cpd-files.txt" -Encoding utf8
pmd cpd --minimum-tokens 100 --language ecmascript -f text --file-list="$env:TEMP\pmd-cpd-files.txt"
if ($LASTEXITCODE -ne 0) {
    Write-Error 'PMD CPD failure, extract duplications.'
    exit 2
}
