#!/usr/bin/env pwsh
# Build and Test Script for Tuff Compiler
# Usage:
#   ./build_and_test.ps1 [TestArgs...]
# Examples:
#   ./build_and_test.ps1                                      # Build and run all tests
#   ./build_and_test.ps1 -Path test/tuff/feature1/test.tuff   # Build and run specific test
#   ./build_and_test.ps1 -Path test/tuff/feature1             # Build and run tests in directory

param(
    [string]$Path = "",
    [switch]$Verbose,
    [string]$Feature = "",
    [int]$Parallel = 0
)

$ErrorActionPreference = "Stop"
$RootDir = $PSScriptRoot

# 1. Build
Write-Host "Building Tuff Compiler..." -ForegroundColor Cyan
Set-Location "$RootDir/bootstrap/build"
cmake --build . --config Release
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}

# 2. Test
Set-Location $RootDir
Write-Host "Running Tests..." -ForegroundColor Cyan
& ./run_tests.ps1 -Path $Path -Verbose:$Verbose -Feature $Feature -Parallel $Parallel
