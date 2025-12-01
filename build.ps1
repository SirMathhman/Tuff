#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Tuff Multi-Platform Build Script

.DESCRIPTION
    Builds Tuff projects for JavaScript and/or C++ targets.
    Preserves package structure in output directory.

.PARAMETER Target
    Build target: "js", "cpp", or "all" (default: all)

.PARAMETER Clean
    Clean dist/ directory before building

.EXAMPLE
    .\build.ps1
    Build all targets

.EXAMPLE
    .\build.ps1 -Target js -Clean
    Clean and build JS target only
#>

param(
    [ValidateSet("all", "js", "cpp")]
    [string]$Target = "all",
    [switch]$Clean
)

$ErrorActionPreference = "Stop"

# Configuration
$RootDir = $PSScriptRoot
$CompilerPath = Join-Path $RootDir "bootstrap\build\Release\tuffc.exe"
$BuildConfigPath = Join-Path $RootDir "build.json"
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
        Write-ColorOutput "[ERROR] build.json not found" $ColorRed
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
    param([string]$Path)
    
    if (-not (Test-Path $Path)) {
        return @()
    }
    
    $fullPath = (Resolve-Path $Path).Path
    
    return Get-ChildItem -Path $fullPath -Filter "*.tuff" -Recurse | ForEach-Object {
        $relativePath = $_.FullName.Substring($fullPath.Length + 1)
        @{
            FullPath = $_.FullName
            RelativePath = $relativePath
            Name = $_.Name
        }
    }
}

function Build-Target {
    param(
        [string]$TargetName,
        [object]$TargetConfig,
        [object]$BuildConfig
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
    
    # Compile each file
    foreach ($commonFile in $commonFiles) {
        $relPath = $commonFile.RelativePath
        $platformFile = $platformFiles | Where-Object { $_.RelativePath -eq $relPath }
        
        # Determine output path
        $outputFile = Join-Path $outputBase ($relPath -replace '\.tuff$', $extension)
        
        # Build source list
        $sources = @($commonFile.FullPath)
        if ($platformFile) {
            $sources += $platformFile.FullPath
        }
        
        # Compile
        $sourcesList = $sources -join ','
        Write-Host "  Compiling: $relPath" -NoNewline
        
        try {
            $result = & $CompilerPath $commonFile.FullPath $TargetName -o $outputFile --sources $sourcesList 2>&1
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
        Build-Target -TargetName $targetName -TargetConfig $targetConfig -BuildConfig $config
    }
    
    Write-Host ""
    Write-ColorOutput "Build complete! Output in: $DistDir" $ColorCyan
    
} catch {
    Write-ColorOutput "`n[ERROR] Build failed: $_" $ColorRed
    exit 1
}
