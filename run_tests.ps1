#!/usr/bin/env pwsh
# Tuff Compiler Automated Test Runner
# Discovers and runs all Tuff compiler tests in test/tuff/
# Compiles each .tuff file to C++ target, executes, and reports results.

param(
    [string]$Path = "",
    [switch]$Verbose,
    [string]$Feature = "",
    [int]$Parallel = 0  # 0 = auto-detect parallelism, 1 = sequential
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# Configuration
$RootDir = $PSScriptRoot
$CompilerPath = Join-Path $RootDir "bootstrap\build\Release\tuffc.exe"
$TestDir = Join-Path $RootDir "src\test\tuff"
$TempDir = Join-Path $env:TEMP "tuff_tests"

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
$Script:IncludeCompilerTests = @()

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
        if ($json.include_compiler_tests) { $Script:IncludeCompilerTests = $json.include_compiler_tests }
    }
    
    # Use persistent cache directory for stdlib (survives between runs)
    $Script:StdlibCacheDir = Join-Path $RootDir ".tuff_cache"
    $Script:StdlibDir = Join-Path $Script:StdlibCacheDir "stdlib_cpp"
    $Script:StdlibObjDir = Join-Path $Script:StdlibCacheDir "stdlib_obj"
    $cacheManifest = Join-Path $Script:StdlibCacheDir "manifest.json"
    
    # Compute hash of all stdlib source files
    $tuffSourceSet = Join-Path $RootDir "src\main\tuff"
    $cppSourceSet = Join-Path $RootDir "src\main\cpp"
    
    # Get all source files and their timestamps (excluding compiler subdirectory)
    $sourceFiles = @()
    $sourceFiles += Get-ChildItem -Path $tuffSourceSet -Filter "*.tuff" -File -Recurse | Where-Object { $_.DirectoryName -notlike "*\compiler" }
    $sourceFiles += Get-ChildItem -Path $cppSourceSet -Filter "*.cpp" -File -Recurse
    $sourceFiles += Get-ChildItem -Path $cppSourceSet -Filter "*.h" -File -Recurse
    $compilerMtime = (Get-Item $CompilerPath).LastWriteTimeUtc.Ticks
    $sourceHash = ($sourceFiles | ForEach-Object { "$($_.FullName):$($_.LastWriteTimeUtc.Ticks)" }) -join "|"
    $sourceHash = "$compilerMtime|$sourceHash"
    $currentHash = [System.Security.Cryptography.SHA256]::Create().ComputeHash([System.Text.Encoding]::UTF8.GetBytes($sourceHash))
    $currentHashStr = [BitConverter]::ToString($currentHash) -replace '-', ''
    
    # Check if cache is valid
    $cacheValid = $false
    if (Test-Path $cacheManifest) {
        try {
            $manifest = Get-Content $cacheManifest -Raw | ConvertFrom-Json
            if ($manifest.hash -eq $currentHashStr -and (Test-Path $Script:StdlibObjDir)) {
                $objFiles = @(Get-ChildItem -Path $Script:StdlibObjDir -Filter "*.o" -File -ErrorAction SilentlyContinue)
                if ($objFiles.Count -gt 0) {
                    $cacheValid = $true
                }
            }
        } catch { }
    }
    
    if ($cacheValid) {
        $Script:StdlibObjFiles = @(Get-ChildItem -Path $Script:StdlibObjDir -Filter "*.o" -File | Select-Object -ExpandProperty FullName)
        Write-ColorOutput "Using cached stdlib ($($Script:StdlibObjFiles.Count) object files)" $ColorGray
    } else {
        Write-ColorOutput "Compiling stdlib (cache miss)..." $ColorGray
        
        # Clean and recreate cache directories
        if (Test-Path $Script:StdlibCacheDir) { Remove-Item $Script:StdlibCacheDir -Recurse -Force }
        New-Item -ItemType Directory -Path $Script:StdlibDir -Force | Out-Null
        New-Item -ItemType Directory -Path $Script:StdlibObjDir -Force | Out-Null
        
        # Compile stdlib (exclude compiler subdirectory which has known issues)
        $stdlibOutput = & $CompilerPath --source-sets "$tuffSourceSet,$cppSourceSet" --exclude "compiler" --target "cpp" --output-dir $Script:StdlibDir 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-ColorOutput "[ERROR] Failed to compile stdlib: $stdlibOutput" $ColorRed
            exit 1
        }
        
        # Pre-compile stdlib cpp files to object files for faster linking
        $includeDir = Join-Path $RootDir "bootstrap\src\include"
        $builtinsDir = Join-Path $RootDir "src\main\cpp"
        $stdlibCppFiles = @(Get-ChildItem -Path $Script:StdlibDir -Filter "*.cpp" -File | Select-Object -ExpandProperty FullName)
        
        # Compile each cpp to .o in parallel
        $stdlibCppFiles | ForEach-Object -ThrottleLimit ([Environment]::ProcessorCount) -Parallel {
            $cppFile = $_
            $objFile = Join-Path $using:Script:StdlibObjDir ([IO.Path]::GetFileNameWithoutExtension($cppFile) + ".o")
            $null = & clang++ -std=c++17 -c -I $using:includeDir -I $using:builtinsDir -I $using:Script:StdlibDir $cppFile -o $objFile 2>&1
        }
        
        # Save cache manifest
        @{ hash = $currentHashStr; timestamp = (Get-Date).ToString("o") } | ConvertTo-Json | Set-Content $cacheManifest
        
        $Script:StdlibObjFiles = @(Get-ChildItem -Path $Script:StdlibObjDir -Filter "*.o" -File | Select-Object -ExpandProperty FullName)
        Write-ColorOutput "Stdlib compiled ($($Script:StdlibObjFiles.Count) object files, cached for next run)" $ColorGray
    }
    
    # Store stdlib hash for test cache invalidation
    $Script:StdlibHash = $currentHashStr
    
    # Test cache directory (for compiled test .o files)
    $Script:TestCacheDir = Join-Path $Script:StdlibCacheDir "tests"
    if (-not (Test-Path $Script:TestCacheDir)) {
        New-Item -ItemType Directory -Path $Script:TestCacheDir -Force | Out-Null
    }
    
    # Use temp directory only for test-specific outputs
    if (Test-Path $TempDir) { Remove-Item $TempDir -Recurse -Force }
    New-Item -ItemType Directory -Path $TempDir -Force | Out-Null
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
    if ($Script:ElapsedTime) {
        Write-ColorOutput "Time: $($Script:ElapsedTime.TotalSeconds.ToString('F2'))s" $ColorGray
    }
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
    
    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
    
    if ($tests.Count -gt 0) {
        if ($maxParallel -eq 1) {
            Write-Host "Running $($tests.Count) tests sequentially (ThrottleLimit 1)..." -ForegroundColor Cyan
        } else {
            Write-Host "Running $($tests.Count) tests in parallel (ThrottleLimit $maxParallel)..." -ForegroundColor Cyan
        }
        
        # Always use parallel execution with adjustable throttle limit
        $results = $tests | ForEach-Object -ThrottleLimit $maxParallel -Parallel {
            $Test = $_
            $CompilerPath = $using:CompilerPath
            $TempDir = $using:TempDir
            $RootDir = $using:RootDir
            $StdlibDir = $using:Script:StdlibDir
            $StdlibObjDir = $using:Script:StdlibObjDir
            $StdlibObjFiles = $using:Script:StdlibObjFiles
            $StdlibHash = $using:Script:StdlibHash
            $TestCacheDir = $using:Script:TestCacheDir
            $SkippedTestsList = $using:Script:SkippedTestsList
            $NegativeTests = $using:Script:NegativeTests
            $ExpectedExitCodes = $using:Script:ExpectedExitCodes
            $IncludeCompilerTests = $using:Script:IncludeCompilerTests
            
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
            
            # Check test cache - hash test file mtime + stdlib hash
            $testMtime = (Get-Item $Test.Path).LastWriteTimeUtc.Ticks
            $testCacheKey = "$($Test.Feature)_$($Test.Name)"
            $testCacheManifest = Join-Path $TestCacheDir "$testCacheKey.json"
            $testObjFile = Join-Path $TestCacheDir "$testCacheKey.o"
            
            $testCacheValid = $false
            if ((Test-Path $testCacheManifest) -and (Test-Path $testObjFile)) {
                try {
                    $manifest = Get-Content $testCacheManifest -Raw | ConvertFrom-Json
                    if ($manifest.testMtime -eq $testMtime -and $manifest.stdlibHash -eq $StdlibHash) {
                        $testCacheValid = $true
                    }
                } catch { }
            }
            
            if (-not $testCacheValid) {
                # Compile to C++ - only test file, stdlib is pre-compiled
                $tuffSourceSet = Join-Path $RootDir "src\main\tuff"
                $cppSourceSet = Join-Path $RootDir "src\main\cpp"
                $sources = "$($Test.Path)"
                $sourceSets = "$tuffSourceSet,$cppSourceSet"
                
                # Use test-specific output directory
                $testOutputDir = Join-Path $TempDir "dist_$testCacheKey"
                New-Item -Path $testOutputDir -ItemType Directory -Force | Out-Null
                
                # Check if this test needs compiler sources included
                $needsCompiler = $IncludeCompilerTests | Where-Object { $Test.RelativePath -like "$_*" }
                if ($needsCompiler) {
                    # Include compiler subdirectory for compiler tests
                    $compileOutput = & $CompilerPath --source-sets $sourceSets --sources $sources --target "cpp" --output-dir $testOutputDir 2>&1
                } else {
                    # Exclude compiler subdirectory for regular tests
                    $compileOutput = & $CompilerPath --source-sets $sourceSets --exclude "compiler" --sources $sources --target "cpp" --output-dir $testOutputDir 2>&1
                }
                if ($LASTEXITCODE -ne 0) {
                    $errorMsg = ($compileOutput | Select-Object -First 20) -join "`n"
                    $result.Status = "ERROR"; $result.Message = "Tuff compile failed:`n$errorMsg"
                    return $result
                }
                
                # Compile test C++ to object file
                $testCppFile = Get-ChildItem -Path $testOutputDir -Filter "tuff_test_*.cpp" -File | Select-Object -First 1 -ExpandProperty FullName
                if (-not $testCppFile) {
                    $result.Status = "ERROR"; $result.Message = "No test cpp file generated"
                    return $result
                }
                
                $includeDir = Join-Path $RootDir "bootstrap\src\include"
                $builtinsDir = Join-Path $RootDir "src\main\cpp"
                
                # For compiler tests, also compile the compiler cpp files
                if ($needsCompiler) {
                    $compilerOutputDir = Join-Path $testOutputDir "compiler"
                    if (Test-Path $compilerOutputDir) {
                        $compilerCppFiles = @(Get-ChildItem -Path $compilerOutputDir -Filter "*.cpp" -File | Select-Object -ExpandProperty FullName)
                        foreach ($cppFile in $compilerCppFiles) {
                            $objFile = $cppFile -replace '\.cpp$', '.o'
                            $compileResult = & clang++ -std=c++17 -c -I $includeDir -I $builtinsDir -I $testOutputDir -I $compilerOutputDir $cppFile -o $objFile 2>&1
                            if ($LASTEXITCODE -ne 0) {
                                $result.Status = "ERROR"; $result.Message = "C++ compile failed (compiler): $compileResult"
                                Remove-Item $testOutputDir -Recurse -Force -ErrorAction SilentlyContinue
                                return $result
                            }
                        }
                    }
                    $compileResult = & clang++ -std=c++17 -c -I $includeDir -I $builtinsDir -I $testOutputDir -I $compilerOutputDir $testCppFile -o $testObjFile 2>&1
                } else {
                    $compileResult = & clang++ -std=c++17 -c -I $includeDir -I $builtinsDir -I $testOutputDir -I $StdlibDir $testCppFile -o $testObjFile 2>&1
                }
                if ($LASTEXITCODE -ne 0) {
                    $result.Status = "ERROR"; $result.Message = "C++ compile failed: $compileResult"
                    Remove-Item $testOutputDir -Recurse -Force -ErrorAction SilentlyContinue
                    return $result
                }
                
                # Save cache manifest
                @{ testMtime = $testMtime; stdlibHash = $StdlibHash } | ConvertTo-Json | Set-Content $testCacheManifest
                
                # Don't remove output dir for compiler tests - we need the .o files
                if (-not $needsCompiler) {
                    Remove-Item $testOutputDir -Recurse -Force -ErrorAction SilentlyContinue
                }
            }
            
            # Link and run
            $needsCompiler = $IncludeCompilerTests | Where-Object { $Test.RelativePath -like "$_*" }
            if ($needsCompiler) {
                # For compiler tests, link with compiler object files
                $testOutputDir = Join-Path $TempDir "dist_$testCacheKey"
                $compilerOutputDir = Join-Path $testOutputDir "compiler"
                $compilerObjFiles = @()
                if (Test-Path $compilerOutputDir) {
                    $compilerObjFiles = @(Get-ChildItem -Path $compilerOutputDir -Filter "*.o" -File | Select-Object -ExpandProperty FullName)
                }
                $allFiles = @($testObjFile) + @($StdlibObjFiles) + @($compilerObjFiles)
            } else {
                $allFiles = @($testObjFile) + @($StdlibObjFiles)
            }
            $uniqueId = [System.Guid]::NewGuid().ToString("N").Substring(0, 8)
            $exeFile = Join-Path $TempDir "${uniqueId}_$($Test.Name).exe"
            
            try {
                $linkOutput = & clang++ -std=c++17 @allFiles -o $exeFile 2>&1
                if ($LASTEXITCODE -ne 0) {
                    $result.Status = "ERROR"; $result.Message = "Link failed: $linkOutput"
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
    }
    
    $stopwatch.Stop()
    $Script:ElapsedTime = $stopwatch.Elapsed
    
    $allPassed = Show-TestSummary
    exit $(if ($allPassed) { 0 } else { 1 })
} finally {
    if (Test-Path $TempDir) { Remove-Item $TempDir -Recurse -Force -ErrorAction SilentlyContinue }
}
