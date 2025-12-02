#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Tuff Compiler Automated Test Runner

.DESCRIPTION
    Discovers and runs all Tuff compiler tests in test/tuff/.
    Compiles each .tuff file to C++ target,
    executes them, and reports results.

.PARAMETER Verbose
    Show detailed output for each test

.PARAMETER Feature
    Run only tests from a specific feature (e.g., "feature1_variables")

.PARAMETER Target
    Run only specific target: "cpp" (default)

.EXAMPLE
    .\run_tests.ps1
    Run all tests

.EXAMPLE
    .\run_tests.ps1 -Verbose
    Run all tests with detailed output

.EXAMPLE
    .\run_tests.ps1 -Feature feature7_generics
    Run only generics tests
#>

param(
    [switch]$Verbose,
    [string]$Feature = "",
    [ValidateSet("cpp")]
    [string]$Target = "cpp",
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
$Script:TotalTests = 0
$Script:PassedTests = 0
$Script:FailedTests = 0
$Script:ErrorTests = 0
$Script:SkippedTests = 0

# Test results by feature
$Script:TestResults = @{}

# Known expected exit codes (can be extended)
$Script:ExpectedExitCodes = @{}

# Config-driven lists
$Script:SkippedTestsList = @()
$Script:NegativeTests = @{}
$Script:NativeOnlyTests = @()

function Write-ColorOutput {
    param(
        [string]$Message,
        [string]$Color = $ColorReset
    )
    Write-Host "${Color}${Message}${ColorReset}"
}

function Initialize-TestEnvironment {
    # Check if compiler exists
    if (-not (Test-Path $CompilerPath)) {
        Write-ColorOutput "[ERROR] Compiler not found at: $CompilerPath" $ColorRed
        Write-ColorOutput "Run: cd bootstrap\build; cmake --build . --config Release" $ColorYellow
        exit 1
    }

    # Check for clang
    if ($Target -eq "cpp") {
        try {
            $null = Get-Command clang -ErrorAction Stop
        } catch {
            Write-ColorOutput "[WARN] clang not found. C++ tests will be skipped." $ColorYellow
            exit 1
        }
    }

    # Load config
    $configFile = Join-Path $TestDir "test_config.json"
    if (Test-Path $configFile) {
        $json = Get-Content $configFile -Raw | ConvertFrom-Json
        
        # Load expected exit codes
        if ($json.expected_exit_codes) {
            $json.expected_exit_codes.PSObject.Properties | ForEach-Object {
                $Script:ExpectedExitCodes[$_.Name] = $_.Value
            }
        }

        # Load skipped tests
        if ($json.skip_tests) {
            $Script:SkippedTestsList = $json.skip_tests
        }

        # Load negative tests (expected to fail compilation)
        if ($json.negative_tests) {
            $json.negative_tests.PSObject.Properties | ForEach-Object {
                $Script:NegativeTests[$_.Name] = $_.Value
            }
        }

        # Load native-only (C++-only) tests
        if ($json.native_only_tests) {
            $Script:NativeOnlyTests = $json.native_only_tests
        }
    }
    # Create temp directory
    if (Test-Path $TempDir) {
        Remove-Item $TempDir -Recurse -Force
    }
    New-Item -ItemType Directory -Path $TempDir -Force | Out-Null
}

function Get-TuffTests {
    param([string]$FeatureFilter = "")
    
    $tests = @()
    $featureDirs = Get-ChildItem -Path $TestDir -Directory -Filter "feature*" | Sort-Object Name
    
    foreach ($featureDir in $featureDirs) {
        if ($FeatureFilter -and $featureDir.Name -ne $FeatureFilter) {
            continue
        }
        
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

function Get-ExpectedExitCode {
    param([string]$TestPath)
    
    if ($Script:ExpectedExitCodes.ContainsKey($TestPath)) {
        return $Script:ExpectedExitCodes[$TestPath]
    }
    
    # Default: no specific expectation (just check consistency)
    return $null
}

function Invoke-TuffCompiler {
    param(
        [string]$SourcePath,
        [string]$TargetType
    )
    
    try {
        $output = & $CompilerPath --sources $SourcePath --target $TargetType 2>&1
        $success = $LASTEXITCODE -eq 0
        return @{
            Success = $success
            Output = $output -join "`n"
            ExitCode = $LASTEXITCODE
        }
    } catch {
        return @{
            Success = $false
            Output = $_.Exception.Message
            ExitCode = -1
        }
    }
}

function Invoke-JavaScriptCode {
    param([string]$Code, [string]$TestName)
    
    $jsFile = Join-Path $TempDir "${TestName}.js"
    
    try {
        Set-Content -Path $jsFile -Value $Code -Encoding UTF8
        
        $output = node $jsFile 2>&1
        $exitCode = $LASTEXITCODE
        
        Remove-Item $jsFile -Force -ErrorAction SilentlyContinue
        
        return @{
            Success = $true
            ExitCode = $exitCode
            Output = $output -join "`n"
        }
    } catch {
        Remove-Item $jsFile -Force -ErrorAction SilentlyContinue
        return @{
            Success = $false
            ExitCode = -1
            Output = $_.Exception.Message
        }
    }
}

function Invoke-CppCode {
    param([string]$Code, [string]$TestName)
    
    $cppFile = Join-Path $TempDir "${TestName}.cpp"
    $exeFile = Join-Path $TempDir "${TestName}.exe"
    
    try {
        Set-Content -Path $cppFile -Value $Code -Encoding UTF8
        
        # Compile
        $compileOutput = clang $cppFile -o $exeFile 2>&1
        if ($LASTEXITCODE -ne 0) {
            Remove-Item $cppFile -Force -ErrorAction SilentlyContinue
            return @{
                Success = $false
                ExitCode = -1
                Output = "C++ compilation failed: $($compileOutput -join "`n")"
            }
        }
        
        # Execute
        $runOutput = & $exeFile 2>&1
        $exitCode = $LASTEXITCODE
        
        # Cleanup
        Remove-Item $cppFile -Force -ErrorAction SilentlyContinue
        Remove-Item $exeFile -Force -ErrorAction SilentlyContinue
        
        return @{
            Success = $true
            ExitCode = $exitCode
            Output = $runOutput -join "`n"
        }
    } catch {
        Remove-Item $cppFile -Force -ErrorAction SilentlyContinue
        Remove-Item $exeFile -Force -ErrorAction SilentlyContinue
        return @{
            Success = $false
            ExitCode = -1
            Output = $_.Exception.Message
        }
    }
}

function Test-TuffFile {
    param([hashtable]$Test)
    
    $result = @{
        Test = $Test
        Status = "UNKNOWN"
        Message = ""
        JsExitCode = $null
        CppExitCode = $null
        ExpectedExitCode = Get-ExpectedExitCode $Test.RelativePath
    }
    
    # Globally skipped tests
    if ($Test.RelativePath -in $Script:SkippedTestsList) {
        $result.Status = "SKIPPED"
        $result.Message = "Skipped via config"
        if ($Verbose) { Write-ColorOutput " - SKIPPED" $ColorYellow }
        return $result
    }

    # Check if this is a negative test (expected to fail compilation)
    if ($Script:NegativeTests.ContainsKey($Test.RelativePath)) {
        $expectedError = $Script:NegativeTests[$Test.RelativePath]
        if ($Verbose) {
            Write-Host "  Testing $($Test.RelativePath) (negative)..." -NoNewline
        }
        
        # Try to compile - should fail
        $compileResult = Invoke-TuffCompiler -SourcePath $Test.Path -TargetType "js"
        
        if ($compileResult.Success) {
            # Compilation succeeded but should have failed
            $result.Status = "FAILED"
            $result.Message = "Expected compilation to fail with '$expectedError' but it succeeded"
            if ($Verbose) { Write-ColorOutput " x FAILED" $ColorRed }
        } elseif ($compileResult.Output -match [regex]::Escape($expectedError)) {
            # Compilation failed with expected error
            $result.Status = "PASSED"
            $result.Message = "Correctly rejected: $expectedError"
            if ($Verbose) { Write-ColorOutput " + PASSED" $ColorGreen }
        } else {
            # Compilation failed but with wrong error
            $result.Status = "FAILED"
            $result.Message = "Expected error '$expectedError' but got: $($compileResult.Output)"
            if ($Verbose) { Write-ColorOutput " x FAILED" $ColorRed }
        }
        return $result
    }

    if ($Verbose) {
        Write-Host "  Testing $($Test.RelativePath)..." -NoNewline
    }
    
    # Compile to JavaScript (skip for native-only tests)
    $jsExitCode = $null
    if ($Target -in @("both", "js") -and $Test.RelativePath -notin $Script:NativeOnlyTests) {
        $jsCompile = Invoke-TuffCompiler -SourcePath $Test.Path -TargetType "js"
        if (-not $jsCompile.Success) {
            $result.Status = "ERROR"
            $result.Message = "JS compilation failed: $($jsCompile.Output)"
            if ($Verbose) { Write-ColorOutput " ! ERROR" $ColorRed }
            return $result
        }
        
        $jsRun = Invoke-JavaScriptCode -Code $jsCompile.Output -TestName $Test.Name
        if (-not $jsRun.Success) {
            $result.Status = "ERROR"
            $result.Message = "JS execution failed: $($jsRun.Output)"
            if ($Verbose) { Write-ColorOutput " ! ERROR" $ColorRed }
            return $result
        }
        
        $result.JsExitCode = $jsRun.ExitCode
        $jsExitCode = $jsRun.ExitCode
    }
    
    # Compile to C++ (always for native-only tests; otherwise respect Target)
    $cppExitCode = $null
    if ($Target -in @("both", "cpp") -or $Test.RelativePath -in $Script:NativeOnlyTests) {
        $cppCompile = Invoke-TuffCompiler -SourcePath $Test.Path -TargetType "cpp"
        if (-not $cppCompile.Success) {
            $result.Status = "ERROR"
            $result.Message = "C++ compilation failed"
            if ($Verbose) { Write-ColorOutput " ! ERROR" $ColorRed }
            return $result
        }
        
        $cppRun = Invoke-CppCode -Code $cppCompile.Output -TestName $Test.Name
        if (-not $cppRun.Success) {
            $result.Status = "ERROR"
            $result.Message = "C++ execution failed: $($cppRun.Output)"
            if ($Verbose) { Write-ColorOutput " ! ERROR" $ColorRed }
            return $result
        }
        
        $result.CppExitCode = $cppRun.ExitCode
        $cppExitCode = $cppRun.ExitCode
    }
    
    # Verify results
    if ($result.ExpectedExitCode -ne $null) {
        # Check against expected exit code
        $allMatch = $true
        if ($jsExitCode -ne $null -and $jsExitCode -ne $result.ExpectedExitCode) {
            $allMatch = $false
        }
        if ($cppExitCode -ne $null -and $cppExitCode -ne $result.ExpectedExitCode) {
            $allMatch = $false
        }
        
        if ($allMatch) {
            $result.Status = "PASSED"
            $result.Message = "Exit code: $($result.ExpectedExitCode)"
            if ($Verbose) { Write-ColorOutput " + PASSED" $ColorGreen }
        } else {
            $result.Status = "FAILED"
            $result.Message = "Expected: $($result.ExpectedExitCode), JS: $jsExitCode, C++: $cppExitCode"
            if ($Verbose) { Write-ColorOutput " x FAILED" $ColorRed }
        }
    } elseif ($Test.RelativePath -in $Script:NativeOnlyTests) {
        # Native-only tests: only check C++ result, ignore JS
        $result.Status = "PASSED"
        $result.Message = "C++ exit code: $cppExitCode"
        if ($Verbose) { Write-ColorOutput " + PASSED" $ColorGreen }
    } else {
        # Check consistency between targets
        if ($Target -eq "both") {
            if ($jsExitCode -eq $cppExitCode) {
                $result.Status = "PASSED"
                $result.Message = "Both targets agree (exit: $jsExitCode)"
                if ($Verbose) { Write-ColorOutput " + PASSED" $ColorGreen }
            } else {
                $result.Status = "FAILED"
                $result.Message = "Exit code mismatch: JS=$jsExitCode, C++=$cppExitCode"
                if ($Verbose) { Write-ColorOutput " x FAILED" $ColorRed }
            }
        } else {
            # Single target - just verify it runs
            $result.Status = "PASSED"
            $exitCode = if ($jsExitCode -ne $null) { $jsExitCode } else { $cppExitCode }
            $result.Message = "Exit code: $exitCode"
            if ($Verbose) { Write-ColorOutput " + PASSED" $ColorGreen }
        }
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
        
        # Show failures
        foreach ($result in $featureResults) {
            if ($result.Status -in @("FAILED", "ERROR")) {
                $statusColor = if ($result.Status -eq "FAILED") { $ColorRed } else { $ColorYellow }
                Write-ColorOutput "  -> $($result.Test.Name): $($result.Message)" $statusColor
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

function Cleanup-TestEnvironment {
    if (Test-Path $TempDir) {
        Remove-Item $TempDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# Main execution
try {
    Write-ColorOutput "=== Tuff Compiler Test Runner ===" $ColorCyan
    Write-Host ""
    
    Initialize-TestEnvironment
    
    $tests = Get-TuffTests -FeatureFilter $Feature
    $Script:TotalTests = $tests.Count
    
    if ($tests.Count -eq 0) {
        Write-ColorOutput "No tests found!" $ColorYellow
        exit 0
    }
    
    Write-ColorOutput "Found $($tests.Count) test(s)" $ColorGray
    Write-ColorOutput "Target: $Target" $ColorGray
    
    # Determine parallelism
    $maxParallel = if ($Parallel -eq 0) { [Environment]::ProcessorCount } else { $Parallel }
    if ($maxParallel -gt 1) {
        Write-ColorOutput "Parallelism: $maxParallel" $ColorGray
    }
    Write-Host ""
    
    # Group tests by feature
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
                    Write-Host ""
                    Write-ColorOutput ">>> FAILURE: $($test.Name) <<<" $ColorRed
                    Write-ColorOutput $result.Message $ColorRed
                    exit 1
                }
                "ERROR" { 
                    $Script:ErrorTests++ 
                    Write-Host ""
                    Write-ColorOutput ">>> ERROR: $($test.Name) <<<" $ColorRed
                    Write-ColorOutput $result.Message $ColorRed
                    exit 1
                }
                "SKIPPED" { $Script:SkippedTests++ }
            }
        }
    }
    
    $allPassed = Show-TestSummary
    
    exit $(if ($allPassed) { 0 } else { 1 })
    
} finally {
    Cleanup-TestEnvironment
}
