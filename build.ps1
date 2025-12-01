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

.PARAMETER Bundle
    Bundle/compile the generated files (JS bundle or native executable)

.EXAMPLE
    .\build.ps1
    Build all targets

.EXAMPLE
    .\build.ps1 -Target js -Clean -Bundle
    Clean, build, and bundle JS target
#>

param(
    [ValidateSet("all", "js", "cpp")]
    [string]$Target = "all",
    [switch]$Clean,
    [switch]$Bundle
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
        return $false
    }
    
    return $true
}

function Bundle-JavaScript {
    param([string]$OutputBase)
    
    Write-ColorOutput "`nGenerating JavaScript build system..." $ColorCyan
    
    $jsFiles = Get-ChildItem -Path $OutputBase -Filter "*.js" -Recurse
    if ($jsFiles.Count -eq 0) {
        Write-ColorOutput "  No JavaScript files found" $ColorYellow
        return
    }
    
    $mainFile = $jsFiles | Where-Object { $_.Name -eq "main.js" } | Select-Object -First 1
    if (-not $mainFile) {
        Write-ColorOutput "  No main.js found, skipping" $ColorYellow
        return
    }
    
    $distRoot = (Resolve-Path (Split-Path $OutputBase -Parent)).Path
    $packageJsonPath = Join-Path $distRoot "package.json"
    $relativePath = $mainFile.FullName.Substring($distRoot.Length + 1)
    $relativeMain = "./" + $relativePath.Replace('\', '/')
    
    @{
        name = "tuff-project"
        version = "0.1.0"
        description = "Tuff compiled JavaScript project"
        type = "module"
        main = $relativeMain
        scripts = @{ start = "node $relativeMain" }
    } | ConvertTo-Json -Depth 10 | Out-File -FilePath $packageJsonPath -Encoding UTF8
    
    Write-ColorOutput "  Created: $packageJsonPath" $ColorGreen
    
    $nodeAvailable = $null -ne (Get-Command node -ErrorAction SilentlyContinue)
    if ($nodeAvailable) {
        Write-Host "  Testing with Node.js..." -NoNewline
        Push-Location $distRoot
        npm start 2>&1 | Out-Null
        Pop-Location
        $exitCode = $LASTEXITCODE
        if ($exitCode -eq 0 -or $exitCode -eq 42) {
            Write-ColorOutput " ✓ (exit code: $exitCode)" $ColorGreen
        } else {
            Write-ColorOutput " ✗ (exit code: $exitCode)" $ColorRed
        }
    } else {
        Write-ColorOutput "  Node.js not found - run 'npm start' in dist/js to execute" $ColorYellow
    }
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
        $implementationFiles = $allCppInDir | Where-Object { (Split-Path $_ -Leaf) -notin @('io.cpp', 'main.cpp') }
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
