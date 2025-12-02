#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Tuff Build Script

.DESCRIPTION
    Builds Tuff projects for C++ target.
    Reads configuration from build.config.json (or custom file via -Config).

.PARAMETER Target
    Build target: "cpp" or "all" (default: cpp)

.PARAMETER Config
    Path to build config file (default: build.config.json in current directory)

.PARAMETER Clean
    Clean dist/ directory before building

.PARAMETER Bundle
    Bundle/compile the generated files (native executable)

.EXAMPLE
    .\build.ps1
    Build cpp target

.EXAMPLE
    .\build.ps1 -Clean -Bundle
    Clean, build, and bundle

.EXAMPLE
    .\build.ps1 -Config custom.json
    Build using custom configuration file
#>

param(
    [ValidateSet("all", "cpp")]
    [string]$Target = "cpp",
    [string]$Config = "",
    [switch]$Clean,
    [switch]$Bundle
)

$ErrorActionPreference = "Stop"

# Configuration
$RootDir = $PSScriptRoot
$CompilerPath = Join-Path $RootDir "bootstrap\build\Release\tuffc.exe"
if ([string]::IsNullOrEmpty($Config)) {
    $BuildConfigPath = Join-Path $RootDir "build.config.json"
} else {
    $BuildConfigPath = $Config
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
    return Get-Content $BuildConfigPath -Raw | ConvertFrom-Json
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

function Copy-PlatformFiles {
    param(
        [string]$SourcePath,
        [string]$DestinationBase,
        [string]$Extension
    )
    
    if (-not (Test-Path $SourcePath)) {
        return 0
    }
    
    $files = Get-SourceFiles -Path $SourcePath -Extension $Extension
    $copied = 0
    
    foreach ($file in $files) {
        $destPath = Join-Path $DestinationBase $file.RelativePath
        $destDir = Split-Path $destPath -Parent
        
        if (-not (Test-Path $destDir)) {
            New-Item -ItemType Directory -Path $destDir -Force | Out-Null
        }
        
        Copy-Item -Path $file.FullPath -Destination $destPath -Force
        $copied++
    }
    
    return $copied
}

function Bundle-Native {
    param([string]$OutputBase)
    
    Write-ColorOutput "`nGenerating native build system..." $ColorCyan
    $cppFiles = Get-ChildItem -Path $OutputBase -Filter "*.cpp" -Recurse
    if ($cppFiles.Count -eq 0) { Write-ColorOutput "  No C++ files found" $ColorYellow; return }
    
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
            } else { Write-ColorOutput " ✗" $ColorRed }
        }
        Pop-Location
    } else {
        Write-ColorOutput "  CMake not found - run 'cmake -B build && cmake --build build' in dist/native" $ColorYellow
    }
}

function Build-Target {
    param(
        [string]$TargetName,
        [object]$TargetConfig,
        [object]$BuildConfig,
        [bool]$ShouldBundle
    )
    
    Write-ColorOutput "`nBuilding target: $TargetName" $ColorCyan
    
    $sourceSets = $TargetConfig.sourceSets
    $outputBase = $TargetConfig.output
    
    # Get common files
    $commonPath = $BuildConfig.sourceSets.commonMain.path
    $commonFiles = Get-SourceFiles -Path $commonPath
    
    # Get platform-specific files
    $platformSourceSet = $sourceSets | Where-Object { $_ -ne "commonMain" } | Select-Object -First 1
    $platformPath = $BuildConfig.sourceSets.$platformSourceSet.path
    $platformFiles = Get-SourceFiles -Path $platformPath
    
    # Get extension
    $extension = $BuildConfig.sourceSets.$platformSourceSet.extension
    
    Write-ColorOutput "  Found $($commonFiles.Count) common files" $ColorGreen
    Write-ColorOutput "  Found $($platformFiles.Count) platform files" $ColorGreen
    
    $compiled = 0
    $errors = 0
    
    # Build complete source list for cross-file visibility
    $allSources = @()
    foreach ($cf in $commonFiles) {
        $allSources += $cf.FullPath
        $pf = $platformFiles | Where-Object { $_.RelativePath -eq $cf.RelativePath }
        if ($pf) { $allSources += $pf.FullPath }
    }
    
    # Compile each file with all sources for cross-file declarations
    foreach ($commonFile in $commonFiles) {
        $relPath = $commonFile.RelativePath
        $outputFile = Join-Path $outputBase ($relPath -replace '\.tuff$', $extension)
        $sourcesList = $allSources -join ','
        
        Write-Host "  Compiling: $relPath" -NoNewline
        
        try {
            $result = & $CompilerPath --sources $sourcesList --target $TargetName -o $outputFile 2>&1
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
    
    Write-ColorOutput "  Compiled $compiled/$($commonFiles.Count) files" $(if ($errors -eq 0) { $ColorGreen } else { $ColorYellow })
    if ($errors -gt 0) {
        Write-ColorOutput "  $errors errors" $ColorRed
        return
    }
    
    # Copy platform-specific .js or .cpp files to dist
    if ($TargetName -eq "js") {
        $copiedJs = Copy-PlatformFiles -SourcePath $platformPath -DestinationBase $outputBase -Extension "*.js"
        if ($copiedJs -gt 0) {
            Write-ColorOutput "  Copied $copiedJs JavaScript implementation file(s)" $ColorGreen
        }
    }
    elseif ($TargetName -eq "cpp") {
        $copiedCpp = Copy-PlatformFiles -SourcePath $platformPath -DestinationBase $outputBase -Extension "*.cpp"
        if ($copiedCpp -gt 0) {
            Write-ColorOutput "  Copied $copiedCpp C++ implementation file(s)" $ColorGreen
        }
    }
    
    # Bundle if requested and compilation succeeded
    if ($ShouldBundle) {
        if ($TargetName -eq "js") {
            Bundle-JavaScript -OutputBase $outputBase
        }
        elseif ($TargetName -eq "cpp") {
            Bundle-Native -OutputBase $outputBase
        }
    }
}

# Main execution
try {
    Write-ColorOutput "=== Tuff Build System ===" $ColorCyan
    
    Initialize-BuildEnvironment
    $config = Get-BuildConfig
    
    $targetsToBuild = @()
    if ($Target -eq "all") {
        $targetsToBuild = $config.targets.PSObject.Properties.Name
    }
    else {
        $targetsToBuild = @($Target)
    }
    
    foreach ($targetName in $targetsToBuild) {
        $targetConfig = $config.targets.$targetName
        Build-Target -TargetName $targetName -TargetConfig $targetConfig -BuildConfig $config -ShouldBundle $Bundle
    }
    
    Write-Host ""
    Write-ColorOutput "Build complete! Output in: $DistDir" $ColorCyan
    
} catch {
    Write-ColorOutput "`n[ERROR] Build failed: $_" $ColorRed
    exit 1
}
