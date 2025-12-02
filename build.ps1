#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Tuff Build Script

.DESCRIPTION
    Builds Tuff projects for C++ target.
    Reads configuration from build.config.json (or custom file via -Config).

.PARAMETER Config
    Path to build config file (default: build.config.json in current directory)

.PARAMETER Clean
    Clean dist/ directory before building

.PARAMETER Bundle
    Bundle/compile the generated files (native executable)

.EXAMPLE
    .\build.ps1
    Build project

.EXAMPLE
    .\build.ps1 -Clean -Bundle
    Clean, build, and bundle

.EXAMPLE
    .\build.ps1 -Config custom.json
    Build using custom configuration file
#>

param(
    [string]$ConfigPath = "",
    [switch]$Clean,
    [switch]$Bundle
)

$ErrorActionPreference = "Stop"

# Configuration
$RootDir = $PSScriptRoot
$CompilerPath = Join-Path $RootDir "bootstrap\build\Release\tuffc.exe"
if ([string]::IsNullOrEmpty($ConfigPath)) {
    $BuildConfigPath = Join-Path $RootDir "build.config.json"
} else {
    $BuildConfigPath = $ConfigPath
}
$DistDir = Join-Path $RootDir "dist"

# ANSI colors
$ColorReset = "`e[0m"
$ColorGreen = "`e[32m"
$ColorCyan = "`e[36m"
$ColorYellow = "`e[33m"
$ColorRed = "`e[31m"

function Write-ColorOutput {
    param([string]$Message, [string]$Color = $ColorReset)
    Write-Host "${Color}${Message}${ColorReset}"
}

function Initialize-BuildEnvironment {
    if (-not (Test-Path $CompilerPath)) {
        Write-ColorOutput "[ERROR] Compiler not found at: $CompilerPath" $ColorRed
        Write-ColorOutput "Run: cd bootstrap\build; cmake --build . --config Release" $ColorYellow
        exit 1
    }

    if (-not (Test-Path $BuildConfigPath)) {
        Write-ColorOutput "[ERROR] Config file not found: $BuildConfigPath" $ColorRed
        exit 1
    }

    if ($Clean -and (Test-Path $DistDir)) {
        Write-ColorOutput "Cleaning dist/ directory..." $ColorCyan
        Remove-Item $DistDir -Recurse -Force
    }
}

function Get-BuildConfig {
    param(
        [string]$Path
    )
    return Get-Content $Path -Raw | ConvertFrom-Json
}

function Get-SourceFiles {
    param(
        [string]$Path,
        [string]$Extension = "*.tuff"
    )
    
    if (-not (Test-Path $Path)) {
        return @()
    }
    
    $fullPath = (Resolve-Path $Path).Path
    
    return Get-ChildItem -Path $fullPath -Filter $Extension -Recurse | ForEach-Object {
        $relativePath = $_.FullName.Substring($fullPath.Length + 1)
        @{
            FullPath = $_.FullName
            RelativePath = $relativePath
            Name = $_.Name
        }
    }
}

function Build {
    param(
        [object]$Config,
        [bool]$ShouldBundle
    )
    
    Write-ColorOutput "`nBuilding..." $ColorCyan
    
    $sourcePath = $Config.sourcePath
    $outputPath = $Config.outputPath
    $target = $Config.target
    

    # Get all source files
    $sourceFiles = Get-SourceFiles -Path $sourcePath
    
    if ($sourceFiles.Count -eq 0) {
        Write-ColorOutput "  No source files found in $sourcePath" $ColorYellow
        return
    }
    
    Write-ColorOutput "  Found $($sourceFiles.Count) source file(s)" $ColorGreen
    
    $compiled = 0
    $errors = 0
    
    # Build source list for cross-file visibility
    $allSourcesList = ($sourceFiles | ForEach-Object { $_.FullPath }) -join ','
    
    # Compile each file with all sources
    foreach ($sourceFile in $sourceFiles) {
        $relPath = $sourceFile.RelativePath
        $outputFile = Join-Path $outputPath ($relPath -replace '\.tuff$', '.cpp')
        
        Write-Host "  Compiling: $relPath" -NoNewline
        
        try {
            $result = & $CompilerPath --sources $allSourcesList --target $target -o $outputFile 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-ColorOutput " ✓" $ColorGreen
                $compiled++
            } else {
                Write-ColorOutput " ✗" $ColorRed
                Write-ColorOutput "    Error: $result" $ColorYellow
                $errors++
            }
        }
        catch {
            Write-ColorOutput " ✗" $ColorRed
            Write-ColorOutput "    Error: $_" $ColorYellow
            $errors++
        }
    }
    
    Write-ColorOutput "  Compiled $compiled/$($sourceFiles.Count) files" $(if ($errors -eq 0) { $ColorGreen } else { $ColorYellow })
    if ($errors -gt 0) {
        Write-ColorOutput "  $errors errors" $ColorRed
        return
    }
    
    # Bundle if requested
    if ($ShouldBundle) {
        Bundle-Native -OutputBase $outputPath
    }
}

function Bundle-Native {
    param([string]$OutputBase)
    
    Write-ColorOutput "`nGenerating native build system..." $ColorCyan
    $cppFiles = Get-ChildItem -Path $OutputBase -Filter "*.cpp" -Recurse
    if ($cppFiles.Count -eq 0) { 
        Write-ColorOutput "  No C++ files found" $ColorYellow
        return 
    }
    
    $distRoot = (Resolve-Path (Split-Path $OutputBase -Parent)).Path
    $cmakeListsPath = Join-Path $distRoot "CMakeLists.txt"
    $buildDir = Join-Path $distRoot "build"
    
    $relativeFiles = $cppFiles | ForEach-Object { $_.FullName.Substring($distRoot.Length + 1).Replace('\', '/') }
    $mainCpp = $relativeFiles | Where-Object { $_ -match 'main\.cpp$' } | Select-Object -First 1
    
    if (-not $mainCpp) {
        $sourcesList = $relativeFiles
    } else {
        $tuffDir = Split-Path $mainCpp -Parent
        $allCppInDir = $relativeFiles | Where-Object { (Split-Path $_ -Parent) -eq $tuffDir }
        $implementationFiles = $allCppInDir | Where-Object { (Split-Path $_ -Leaf) -notin @('main.cpp') }
        $sourcesList = @($mainCpp) + $implementationFiles
        if ($implementationFiles.Count -gt 0) {
            Write-ColorOutput "  Including $($implementationFiles.Count) implementation file(s)" $ColorGreen
        }
    }
    
    @"
cmake_minimum_required(VERSION 3.15)
project(TuffProject)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(SOURCES
$(($sourcesList | ForEach-Object { "    $_" }) -join "`n")
)
add_executable(program `${SOURCES})
"@ | Out-File -FilePath $cmakeListsPath -Encoding UTF8
    
    Write-ColorOutput "  Created: $cmakeListsPath" $ColorGreen
    
    if (Get-Command cmake -ErrorAction SilentlyContinue) {
        if (Test-Path $buildDir) { Remove-Item $buildDir -Recurse -Force }
        New-Item -ItemType Directory -Path $buildDir -Force | Out-Null
        
        Push-Location $buildDir
        cmake .. 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  Building with CMake..." -NoNewline
            cmake --build . --config Release 2>&1 | Out-Null
            if ($LASTEXITCODE -eq 0) {
                Write-ColorOutput " ✓" $ColorGreen
                $exePath = Get-ChildItem -Path $buildDir -Filter "program*" -Recurse | Where-Object { $_.Extension -in @('.exe', '') } | Select-Object -First 1
                if ($exePath) {
                    Write-Host "  Testing executable..." -NoNewline
                    & $exePath.FullName 2>&1 | Out-Null
                    $exitCode = $LASTEXITCODE
                    if ($exitCode -eq 0 -or $exitCode -eq 42) {
                        Write-ColorOutput " ✓ (exit code: $exitCode)" $ColorGreen
                    } else {
                        Write-ColorOutput " ✗ (exit code: $exitCode)" $ColorRed
                    }
                }
            } else { 
                Write-ColorOutput " ✗" $ColorRed 
            }
        }
        Pop-Location
    } else {
        Write-ColorOutput "  CMake not found - run 'cmake -B build && cmake --build build' in dist" $ColorYellow
    }
}

# Main execution
try {
    Write-ColorOutput "=== Tuff Build System ===" $ColorCyan
    
    Initialize-BuildEnvironment
    $config = Get-BuildConfig -Path $BuildConfigPath
    
    Build -Config $config -ShouldBundle $Bundle
    
    Write-Host ""
    Write-ColorOutput "Build complete! Output in: $DistDir" $ColorCyan
    
} catch {
    Write-ColorOutput "`n[ERROR] Build failed: $_" $ColorRed
    exit 1
}
