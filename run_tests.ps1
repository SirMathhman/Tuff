#!/usr/bin/env pwsh
# Tuff Compiler Automated Test Runner
# Discovers and runs all Tuff compiler tests in test/tuff/
# Compiles each .tuff file to C++ target, executes, and reports results.

param(
    [string]$Path = "",
    [switch]$Verbose,
    [string]$Feature = "",
    [int]$Parallel = 0  # 0 = auto-detect, 1 = sequential
)

$ErrorActionPreference = "Stop"

# Configuration
$RootDir = $PSScriptRoot
$CompilerPath = Join-Path $RootDir "bootstrap\build\Release\tuffc.exe"
$TestDir = Join-Path $RootDir "src\test\tuff"
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
    try { $null = Get-Command clang++ -ErrorAction Stop } catch {
        Write-ColorOutput "[WARN] clang++ not found." $ColorYellow
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
    
    # Copy builtin headers to temp directory for test compilation
    $builtinHeaders = @("string_builtins.h", "file_builtins.h", "io_builtins.h")
    foreach ($header in $builtinHeaders) {
        $headerPath = Join-Path $RootDir "src\main\cpp\$header"
        if (Test-Path $headerPath) {
            Copy-Item $headerPath -Destination $TempDir -Force
        }
    }
}

function Get-TuffTests([string]$InputPath = "", [string]$FeatureFilter = "") {
    $tests = @()
    
    if ($InputPath) {
        $resolvedPath = Resolve-Path $InputPath
        if (Test-Path $resolvedPath -PathType Leaf) {
            # Single file
            $item = Get-Item $resolvedPath
            $feature = $item.Directory.Name
            $tests += @{
                Path = $item.FullName
                Feature = $feature
                Name = $item.BaseName
                RelativePath = "$feature/$($item.BaseName)"
            }
        } elseif (Test-Path $resolvedPath -PathType Container) {
            # Directory - recursive search
            $files = Get-ChildItem -Path $resolvedPath -Recurse -Filter "test_*.tuff"
            foreach ($file in $files) {
                $feature = $file.Directory.Name
                $tests += @{
                    Path = $file.FullName
                    Feature = $feature
                    Name = $file.BaseName
                    RelativePath = "$feature/$($file.BaseName)"
                }
            }
        }
    } else {
        # Get all test directories (feature* and compiler)
        $testDirs = Get-ChildItem -Path $TestDir -Directory | Where-Object {
            $_.Name -like "feature*" -or $_.Name -eq "compiler"
        } | Sort-Object Name
        
        foreach ($testDir in $testDirs) {
            if ($FeatureFilter -and $testDir.Name -ne $FeatureFilter) { continue }
            $testFiles = Get-ChildItem -Path $testDir.FullName -Filter "test_*.tuff" | Sort-Object Name
            foreach ($testFile in $testFiles) {
                $tests += @{
                    Path = $testFile.FullName
                    Feature = $testDir.Name
                    Name = $testFile.BaseName
                    RelativePath = "$($testDir.Name)/$($testFile.BaseName)"
                }
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

    # Compile to C++ - include stdlib for tests that use it
    $tuffSourceSet = Join-Path $RootDir "src\main\tuff"
    $cppSourceSet = Join-Path $RootDir "src\main\cpp"
    $sources = "$($Test.Path)"
    $sourceSets = "$tuffSourceSet,$cppSourceSet"
    $cppCode = & $CompilerPath --source-sets $sourceSets --sources $sources --target "cpp" 2>&1
    if ($LASTEXITCODE -ne 0) {
        $errorMsg = ($cppCode | Select-Object -First 20) -join "`n"
        $result.Status = "ERROR"; $result.Message = "Tuff compilation failed:`n$errorMsg"
        return $result
    }

    $cppFile = Join-Path $TempDir "$($Test.Name).cpp"
    $exeFile = Join-Path $TempDir "$($Test.Name).exe"
    
    try {
        Set-Content -Path $cppFile -Value ($cppCode -join "`n") -Encoding UTF8
        $includeDir = Join-Path $RootDir "bootstrap\src\include"
        $compileOutput = clang++ -std=c++17 -I $includeDir -I $TempDir $cppFile -o $exeFile 2>&1
        if ($LASTEXITCODE -ne 0) {
            $errorLines = ($compileOutput | Select-String "error:" | Select-Object -First 3) -join "; "
            $result.Status = "ERROR"; $result.Message = "C++ compilation failed: $errorLines"
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
    
    $tests = Get-TuffTests -InputPath $Path -FeatureFilter $Feature
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
            $RootDir = $using:RootDir
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
            
            # Include stdlib directory for tests that use it
            $stdlibDir = Join-Path $RootDir "src\tuff"
            $sources = "$stdlibDir,$($Test.Path)"
            $cppCode = & $CompilerPath --sources $sources --target "cpp" 2>&1
            if ($LASTEXITCODE -ne 0) {
                $errorMsg = ($cppCode | Select-Object -First 20) -join "`n"
                $result.Status = "ERROR"; $result.Message = "Tuff compile failed:`n$errorMsg"
                return $result
            }
            
            $uniqueId = [System.Guid]::NewGuid().ToString("N").Substring(0, 8)
            $cppFile = Join-Path $TempDir "${uniqueId}_$($Test.Name).cpp"
            $exeFile = Join-Path $TempDir "${uniqueId}_$($Test.Name).exe"
            
            try {
                Set-Content -Path $cppFile -Value ($cppCode -join "`n") -Encoding UTF8
                $includeDir = Join-Path $RootDir "bootstrap\src\include"
                $builtinsDir = Join-Path $RootDir "src\tuff\builtins"
                $compileOutput = clang++ -std=c++17 -I $includeDir -I $builtinsDir -I $TempDir $cppFile -o $exeFile 2>&1
                if ($LASTEXITCODE -ne 0) {
                    $errorLines = ($compileOutput | Select-String "error:" | Select-Object -First 3) -join "; "
                    $result.Status = "ERROR"; $result.Message = "C++ compilation failed: $errorLines"
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
