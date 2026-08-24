# Run the test suite with coverage and a per-test timeout.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root

bun test --timeout 10000 --coverage
exit $LASTEXITCODE
# Runs the test suite with coverage and a timeout.
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))

$proc = Start-Process -FilePath 'bun' -ArgumentList 'test', '--coverage' -NoNewWindow -PassThru
if (-not $proc.WaitForExit(120000)) {
    $proc.Kill()
    Write-Error 'Test run timed out after 120s.'
    exit 2
}
if ($proc.ExitCode -ne 0) {
    Write-Error 'Test failure.'
    exit 2
}
