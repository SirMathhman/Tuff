# Detect copy/pasted code blocks with PMD CPD (ecmascript).
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root

$pmd = (Get-Command pmd -ErrorAction SilentlyContinue).Source
if (-not $pmd) {
  $candidate = 'C:\Tools\pmd-bin-7.18.0\bin\pmd.bat'
  if (Test-Path $candidate) { $pmd = $candidate }
}
if (-not $pmd) {
  Write-Error 'PMD not found on PATH or at C:\Tools\pmd-bin-7.18.0\bin\pmd.bat'
  exit 1
}

$files = git ls-files '*.js' '*.ts'
if (-not $files -or @($files).Count -eq 0) { exit 0 }

& $pmd cpd --language ecmascript --minimum-tokens 100 --skip-duplicate-files @files
exit $LASTEXITCODE
