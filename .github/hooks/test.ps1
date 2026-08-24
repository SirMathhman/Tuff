# Compile and run the test suite. Exits non-zero on compile or test failure.
$ErrorActionPreference = "Stop"
Set-Location (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent)

$srcs = @("main.c", "lexer.c", "parser.c", "eval.c")
$exe = Join-Path (Get-Location) "main.exe"

& clang -Wall -Wextra -o $exe $srcs
if ($LASTEXITCODE -ne 0) {
    Write-Error "Compilation failed."
    exit 1
}

$testSrcs = @("tests\tests.c", "lexer.c", "parser.c", "eval.c")
$testExe = Join-Path (Get-Location) "tests\tests.exe"

& clang -Wall -Wextra -o $testExe $testSrcs
if ($LASTEXITCODE -ne 0) {
    Write-Error "Test compilation failed."
    exit 1
}

& $testExe
if ($LASTEXITCODE -ne 0) {
    Write-Error "Tests failed."
    exit 1
}
