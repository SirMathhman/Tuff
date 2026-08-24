# Compile and run the test suite. Exits non-zero on compile or test failure.
$ErrorActionPreference = "Stop"
Set-Location (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent)

$src = "main.c"
$exe = Join-Path (Get-Location) "main.exe"

& clang -Wall -Wextra -o $exe $src
if ($LASTEXITCODE -ne 0) {
    Write-Error "Compilation failed."
    exit 1
}

& $exe
if ($LASTEXITCODE -ne 0) {
    Write-Error "Tests failed."
    exit 1
}
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
