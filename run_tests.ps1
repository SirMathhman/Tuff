#!/usr/bin/env pwsh
# Tuff Compiler Automated Test Runner
# Discovers and runs all Tuff compiler tests in test/tuff/
# Compiles each .tuff file to C++ target, executes, and reports results.

param(
    [switch]$Verbose,
    [string]$Feature = "",
    [int]$Parallel = 0  # 0 = auto-detect, 1 = sequential
)

$ErrorActionPreference = "Stop"

# Configuration
$RootDir = $PSScriptRoot
$CompilerPath = Join-Path $RootDir "bootstrap\build\Release\tuffc.exe"
$TestDir = Join-Path $RootDir "test\tuff"
$TempDir = Join-Path $TestDir "_temp"

# ANSI color codes
$ColorReset = "`e[0m"
$ColorGreen = "`e[32m"
$ColorRed = "`e[31m"
$ColorYellow = "`e[33m"
$ColorCyan = "`e[36m"
$ColorGray = "`e[90m"

# Test statistics
$Script:PassedTests = 0
$Script:FailedTests = 0
$Script:ErrorTests = 0
$Script:SkippedTests = 0
$Script:TestResults = @{}

# Config-driven lists
$Script:ExpectedExitCodes = @{}
$Script:SkippedTestsList = @()
$Script:NegativeTests = @{}
$Script:NativeOnlyTests = @()

function Write-ColorOutput($Message, $Color = $ColorReset) {
    Write-Host "${Color}${Message}${ColorReset}"
}

function Initialize-TestEnvironment {
    if (-not (Test-Path $CompilerPath)) {
        Write-ColorOutput "[ERROR] Compiler not found at: $CompilerPath" $ColorRed
        exit 1
    }
    try { $null = Get-Command clang -ErrorAction Stop } catch {
        Write-ColorOutput "[WARN] clang not found." $ColorYellow
        exit 1
    }

    # Load config
    $configFile = Join-Path $TestDir "test_config.json"
    if (Test-Path $configFile) {
        $json = Get-Content $configFile -Raw | ConvertFrom-Json
        if ($json.expected_exit_codes) {
            $json.expected_exit_codes.PSObject.Properties | ForEach-Object {
                $Script:ExpectedExitCodes[$_.Name] = $_.Value
            }
        }
        if ($json.skip_tests) { $Script:SkippedTestsList = $json.skip_tests }
        if ($json.negative_tests) {
            $json.negative_tests.PSObject.Properties | ForEach-Object {
                $Script:NegativeTests[$_.Name] = $_.Value
            }
        }
        if ($json.native_only_tests) { $Script:NativeOnlyTests = $json.native_only_tests }
    }
    
    if (Test-Path $TempDir) { Remove-Item $TempDir -Recurse -Force }
    New-Item -ItemType Directory -Path $TempDir -Force | Out-Null
}

function Get-TuffTests([string]$FeatureFilter = "") {
    $tests = @()
    $featureDirs = Get-ChildItem -Path $TestDir -Directory -Filter "feature*" | Sort-Object Name
    foreach ($featureDir in $featureDirs) {
        if ($FeatureFilter -and $featureDir.Name -ne $FeatureFilter) { continue }
        $testFiles = Get-ChildItem -Path $featureDir.FullName -Filter "test_*.tuff" | Sort-Object Name
        foreach ($testFile in $testFiles) {
            $tests += @{
                Path = $testFile.FullName
                Feature = $featureDir.Name
                Name = $testFile.BaseName
                RelativePath = "$($featureDir.Name)/$($testFile.BaseName)"
            }
        }
    }
    return $tests
}

function Test-TuffFile([hashtable]$Test) {
    $result = @{
        Test = $Test; Status = "UNKNOWN"; Message = ""; CppExitCode = $null
        ExpectedExitCode = if ($Script:ExpectedExitCodes.ContainsKey($Test.RelativePath)) { 
            $Script:ExpectedExitCodes[$Test.RelativePath] 
        } else { $null }
    }
    
    if ($Test.RelativePath -in $Script:SkippedTestsList) {
        $result.Status = "SKIPPED"; $result.Message = "Skipped via config"
        return $result
    }

    # Negative test check
    if ($Script:NegativeTests.ContainsKey($Test.RelativePath)) {
        $expectedError = $Script:NegativeTests[$Test.RelativePath]
        $output = & $CompilerPath --sources $Test.Path --target "js" 2>&1
        if ($LASTEXITCODE -eq 0) {
            $result.Status = "FAILED"; $result.Message = "Expected compilation to fail"
        } elseif (($output -join "`n") -match [regex]::Escape($expectedError)) {
            $result.Status = "PASSED"; $result.Message = "Correctly rejected"
        } else {
            $result.Status = "FAILED"; $result.Message = "Wrong error"
        }
        return $result
    }

    # Compile to C++
    $cppCode = & $CompilerPath --sources $Test.Path --target "cpp" 2>&1
    if ($LASTEXITCODE -ne 0) {
        $result.Status = "ERROR"; $result.Message = "Tuff compilation failed"
        return $result
    }

    $cppFile = Join-Path $TempDir "$($Test.Name).cpp"
    $exeFile = Join-Path $TempDir "$($Test.Name).exe"
    
    try {
        Set-Content -Path $cppFile -Value ($cppCode -join "`n") -Encoding UTF8
        $compileOutput = clang $cppFile -o $exeFile 2>&1
        if ($LASTEXITCODE -ne 0) {
            $result.Status = "ERROR"; $result.Message = "clang failed"
            return $result
        }
        $null = & $exeFile 2>&1
        $result.CppExitCode = $LASTEXITCODE
        
        if ($null -ne $result.ExpectedExitCode) {
            if ($result.CppExitCode -eq $result.ExpectedExitCode) {
                $result.Status = "PASSED"; $result.Message = "Exit: $($result.CppExitCode)"
            } else {
                $result.Status = "FAILED"
                $result.Message = "Expected $($result.ExpectedExitCode), got $($result.CppExitCode)"
            }
        } else {
            $result.Status = "PASSED"; $result.Message = "Exit: $($result.CppExitCode)"
        }
    } finally {
        Remove-Item $cppFile -Force -ErrorAction SilentlyContinue
        Remove-Item $exeFile -Force -ErrorAction SilentlyContinue
    }
    return $result
}

function Show-TestSummary {
    Write-Host ""
    Write-ColorOutput "============================================================" $ColorCyan
    Write-ColorOutput "                       TEST SUMMARY" $ColorCyan
    Write-ColorOutput "============================================================" $ColorCyan
    
    $allPassed = $true
    foreach ($featureName in ($Script:TestResults.Keys | Sort-Object)) {
        $featureResults = $Script:TestResults[$featureName]
        $passed = ($featureResults | Where-Object { $_.Status -eq "PASSED" }).Count
        $failed = ($featureResults | Where-Object { $_.Status -eq "FAILED" }).Count
        $errors = ($featureResults | Where-Object { $_.Status -eq "ERROR" }).Count
        $total = $featureResults.Count
        
        $icon = if ($failed -eq 0 -and $errors -eq 0) { "[OK]" } else { "[X]"; $allPassed = $false }
        $color = if ($failed -eq 0 -and $errors -eq 0) { $ColorGreen } else { $ColorRed }
        
        Write-Host ""
        Write-ColorOutput "${icon} ${featureName}: ${passed}/${total} passed" $color
        
        foreach ($result in $featureResults) {
            if ($result.Status -in @("FAILED", "ERROR")) {
                Write-ColorOutput "  -> $($result.Test.Name): $($result.Message)" $ColorRed
            }
        }
    }
    
    Write-Host ""
    Write-ColorOutput "============================================================" $ColorCyan
    $total = $Script:PassedTests + $Script:FailedTests + $Script:ErrorTests
    Write-ColorOutput "TOTAL: $($Script:PassedTests)/${total} passed, $($Script:FailedTests) failed, $($Script:ErrorTests) errors" $ColorCyan
    Write-ColorOutput "============================================================" $ColorCyan
    return $allPassed
}

# Main execution
try {
    Write-ColorOutput "=== Tuff Compiler Test Runner ===" $ColorCyan
    Write-Host ""
    Initialize-TestEnvironment
    
    $tests = Get-TuffTests -FeatureFilter $Feature
    if ($tests.Count -eq 0) {
        Write-ColorOutput "No tests found!" $ColorYellow
        exit 0
    }
    
    $maxParallel = if ($Parallel -eq 0) { [Environment]::ProcessorCount } else { $Parallel }
    Write-ColorOutput "Found $($tests.Count) test(s)" $ColorGray
    if ($maxParallel -gt 1) { Write-ColorOutput "Parallelism: $maxParallel" $ColorGray }
    Write-Host ""
    
    if ($maxParallel -gt 1 -and $tests.Count -gt 1) {
        Write-Host "Running $($tests.Count) tests in parallel..." -ForegroundColor Cyan
        
        $results = $tests | ForEach-Object -ThrottleLimit $maxParallel -Parallel {
            $Test = $_
            $CompilerPath = $using:CompilerPath
            $TempDir = $using:TempDir
            $SkippedTestsList = $using:Script:SkippedTestsList
            $NegativeTests = $using:Script:NegativeTests
            $ExpectedExitCodes = $using:Script:ExpectedExitCodes
            
            $result = @{
                Test = $Test; Status = "UNKNOWN"; Message = ""; CppExitCode = $null
                ExpectedExitCode = if ($ExpectedExitCodes.ContainsKey($Test.RelativePath)) { 
                    $ExpectedExitCodes[$Test.RelativePath] } else { $null }
            }
            
            if ($Test.RelativePath -in $SkippedTestsList) {
                $result.Status = "SKIPPED"; $result.Message = "Skipped"
                return $result
            }
            
            if ($NegativeTests.ContainsKey($Test.RelativePath)) {
                $expectedError = $NegativeTests[$Test.RelativePath]
                $output = & $CompilerPath --sources $Test.Path --target "js" 2>&1
                if ($LASTEXITCODE -eq 0) {
                    $result.Status = "FAILED"; $result.Message = "Expected fail"
                } elseif (($output -join "`n") -match [regex]::Escape($expectedError)) {
                    $result.Status = "PASSED"; $result.Message = "Correctly rejected"
                } else {
                    $result.Status = "FAILED"; $result.Message = "Wrong error"
                }
                return $result
            }
            
            $cppCode = & $CompilerPath --sources $Test.Path --target "cpp" 2>&1
            if ($LASTEXITCODE -ne 0) {
                $result.Status = "ERROR"; $result.Message = "Tuff compile failed"
                return $result
            }
            
            $uniqueId = [System.Guid]::NewGuid().ToString("N").Substring(0, 8)
            $cppFile = Join-Path $TempDir "${uniqueId}_$($Test.Name).cpp"
            $exeFile = Join-Path $TempDir "${uniqueId}_$($Test.Name).exe"
            
            try {
                Set-Content -Path $cppFile -Value ($cppCode -join "`n") -Encoding UTF8
                $null = clang $cppFile -o $exeFile 2>&1
                if ($LASTEXITCODE -ne 0) {
                    $result.Status = "ERROR"; $result.Message = "clang failed"
                    return $result
                }
                $null = & $exeFile 2>&1
                $result.CppExitCode = $LASTEXITCODE
                
                if ($null -ne $result.ExpectedExitCode) {
                    if ($result.CppExitCode -eq $result.ExpectedExitCode) {
                        $result.Status = "PASSED"
                    } else {
                        $result.Status = "FAILED"
                        $result.Message = "Expected $($result.ExpectedExitCode), got $($result.CppExitCode)"
                    }
                } else {
                    $result.Status = "PASSED"
                }
                $result.Message = "Exit: $($result.CppExitCode)"
            } finally {
                Remove-Item $cppFile -Force -ErrorAction SilentlyContinue
                Remove-Item $exeFile -Force -ErrorAction SilentlyContinue
            }
            return $result
        }
        
        foreach ($result in $results) {
            $featureName = $result.Test.Feature
            if (-not $Script:TestResults.ContainsKey($featureName)) {
                $Script:TestResults[$featureName] = @()
            }
            $Script:TestResults[$featureName] += $result
            switch ($result.Status) {
                "PASSED" { $Script:PassedTests++ }
                "FAILED" { $Script:FailedTests++ }
                "ERROR" { $Script:ErrorTests++ }
                "SKIPPED" { $Script:SkippedTests++ }
            }
        }
    } else {
        # Sequential execution
        $testsByFeature = $tests | Group-Object -Property Feature
        foreach ($group in $testsByFeature) {
            Write-Host "Running $($group.Name) [$($group.Count) files]..." -ForegroundColor Cyan
            $Script:TestResults[$group.Name] = @()
            foreach ($test in $group.Group) {
                $result = Test-TuffFile -Test $test
                $Script:TestResults[$group.Name] += $result
                switch ($result.Status) {
                    "PASSED" { $Script:PassedTests++ }
                    "FAILED" { 
                        $Script:FailedTests++
                        Write-ColorOutput ">>> FAILURE: $($test.Name) - $($result.Message)" $ColorRed
                        exit 1
                    }
                    "ERROR" { 
                        $Script:ErrorTests++
                        Write-ColorOutput ">>> ERROR: $($test.Name) - $($result.Message)" $ColorRed
                        exit 1
                    }
                    "SKIPPED" { $Script:SkippedTests++ }
                }
            }
        }
    }
    
    $allPassed = Show-TestSummary
    exit $(if ($allPassed) { 0 } else { 1 })
} finally {
    if (Test-Path $TempDir) { Remove-Item $TempDir -Recurse -Force -ErrorAction SilentlyContinue }
}
