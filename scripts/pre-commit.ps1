<#
.SYNOPSIS
    Pre-commit hook script for Tuff interpreter project
.DESCRIPTION
    Runs tests and code duplication checks before allowing commits
#>

param(
    [string]$GitRoot = $(git rev-parse --show-toplevel)
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Change to repository root
Push-Location $GitRoot

try {
    Write-Host "Running pre-commit checks..." -ForegroundColor Cyan
    
    # Step 1: Run tests
    Write-Host "`n[1/2] Running test suite..." -ForegroundColor Yellow
    & powershell -NoProfile -ExecutionPolicy Bypass -File ./test.ps1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[FAILED] Tests failed. Commit aborted." -ForegroundColor Red
        exit 1
    }
    Write-Host "[PASSED] Tests passed" -ForegroundColor Green
    
    # Step 2: Check for code duplication
    Write-Host "`n[2/2] Checking for code duplication..." -ForegroundColor Yellow
    pmd cpd interpret.c test.c --language cpp --minimum-tokens 35 --ignore-literals
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[WARNING] Code duplication detected. Review before committing." -ForegroundColor Yellow
        exit 1
    }
    Write-Host "[PASSED] No significant duplication detected" -ForegroundColor Green
    
    Write-Host "`n[SUCCESS] All pre-commit checks passed!" -ForegroundColor Green
    exit 0
}
catch {
    Write-Host "`n[ERROR] Pre-commit check failed: $_" -ForegroundColor Red
    exit 1
}
finally {
    Pop-Location
}
