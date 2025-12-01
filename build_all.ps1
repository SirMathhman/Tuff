#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Complete Tuff Build Pipeline

.DESCRIPTION
    Executes the complete build pipeline:
    1. Build the Tuff compiler (C++ bootstrap)
    2. Run the compiler to generate JavaScript code
    3. Run the compiler to generate C++ code
    4. Build the generated JavaScript project
    5. Build the generated C++ project

.PARAMETER SkipCompiler
    Skip rebuilding the compiler if it already exists

.PARAMETER Clean
    Clean all output directories before building

.PARAMETER SkipTests
    Skip testing the built executables

.EXAMPLE
    .\build_all.ps1
    Full rebuild of everything

.EXAMPLE
    .\build_all.ps1 -SkipCompiler
    Use existing compiler, rebuild outputs

.EXAMPLE
    .\build_all.ps1 -Clean
    Clean build from scratch
#>

param(
    [switch]$SkipCompiler,
    [switch]$Clean,
    [switch]$SkipTests
)

$ErrorActionPreference = "Stop"

# Configuration
$RootDir = $PSScriptRoot
$CompilerBuildDir = Join-Path $RootDir "bootstrap\build"
$CompilerPath = Join-Path $CompilerBuildDir "Release\tuffc.exe"
$DistDir = Join-Path $RootDir "dist"

# ANSI colors
$ColorReset = "`e[0m"
$ColorGreen = "`e[32m"
$ColorCyan = "`e[36m"
$ColorYellow = "`e[33m"
$ColorRed = "`e[31m"
$ColorBold = "`e[1m"

function Write-Step {
    param([string]$Message)
    Write-Host "${ColorBold}${ColorCyan}==> $Message${ColorReset}"
}

function Write-Success {
    param([string]$Message)
    Write-Host "${ColorGreen}✓ $Message${ColorReset}"
}

function Write-Error {
    param([string]$Message)
    Write-Host "${ColorRed}✗ $Message${ColorReset}"
}

function Write-Info {
    param([string]$Message)
    Write-Host "${ColorYellow}  $Message${ColorReset}"
}

# Step 1: Build the compiler
function Build-Compiler {
    Write-Step "Step 1/5: Building Tuff Compiler"
    
    if ($SkipCompiler -and (Test-Path $CompilerPath)) {
        Write-Info "Compiler exists, skipping rebuild"
        Write-Success "Compiler ready at: $CompilerPath"
        return $true
    }
    
    if (-not (Test-Path $CompilerBuildDir)) {
        Write-Info "Creating build directory..."
        New-Item -ItemType Directory -Path $CompilerBuildDir -Force | Out-Null
    }
    
    Push-Location $CompilerBuildDir
    try {
        # Check if CMake cache exists
        if (-not (Test-Path "CMakeCache.txt")) {
            Write-Info "Configuring CMake..."
            cmake .. 2>&1 | Out-Null
            if ($LASTEXITCODE -ne 0) {
                Write-Error "CMake configuration failed"
                return $false
            }
        }
        
        Write-Info "Building compiler (Release)..."
        $output = cmake --build . --config Release 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Compiler build failed"
            Write-Host $output
            return $false
        }
        
        if (-not (Test-Path $CompilerPath)) {
            Write-Error "Compiler executable not found after build"
            return $false
        }
        
        Write-Success "Compiler built successfully"
        return $true
    }
    finally {
        Pop-Location
    }
}

# Step 2: Compile Tuff source to JavaScript
function Compile-ToJavaScript {
    Write-Step "Step 2/5: Compiling Tuff to JavaScript"
    
    Push-Location $RootDir
    try {
        $output = & ".\build.ps1" -Target js -Clean:$Clean 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Error "JavaScript compilation failed"
            Write-Host $output
            return $false
        }
        
        Write-Success "JavaScript code generated"
        return $true
    }
    finally {
        Pop-Location
    }
}

# Step 3: Compile Tuff source to C++
function Compile-ToCpp {
    Write-Step "Step 3/5: Compiling Tuff to C++"
    
    Push-Location $RootDir
    try {
        $output = & ".\build.ps1" -Target cpp 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Error "C++ compilation failed"
            Write-Host $output
            return $false
        }
        
        Write-Success "C++ code generated"
        return $true
    }
    finally {
        Pop-Location
    }
}

# Step 4: Build JavaScript project
function Build-JavaScript {
    Write-Step "Step 4/5: Building JavaScript Project"
    
    $jsDistDir = Join-Path $DistDir "js"
    $packageJsonPath = Join-Path $jsDistDir "package.json"
    
    if (-not (Test-Path $packageJsonPath)) {
        Write-Info "Generating package.json..."
        
        $jsFiles = Get-ChildItem -Path (Join-Path $jsDistDir "tuff") -Filter "*.js" -Recurse -ErrorAction SilentlyContinue
        if ($jsFiles.Count -eq 0) {
            Write-Error "No JavaScript files found in dist/js"
            return $false
        }
        
        $mainFile = $jsFiles | Where-Object { $_.Name -eq "main.js" } | Select-Object -First 1
        if (-not $mainFile) {
            Write-Error "No main.js found"
            return $false
        }
        
        $relativePath = $mainFile.FullName.Substring($jsDistDir.Length + 1)
        $relativeMain = "./" + $relativePath.Replace('\', '/')
        
        @{
            name = "tuff-project"
            version = "0.1.0"
            description = "Tuff compiled JavaScript project"
            type = "module"
            main = $relativeMain
            scripts = @{ start = "node $relativeMain" }
        } | ConvertTo-Json -Depth 10 | Out-File -FilePath $packageJsonPath -Encoding UTF8
        
        Write-Success "package.json created"
    }
    
    # Test execution
    if (-not $SkipTests -and (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Info "Testing JavaScript build..."
        Push-Location $jsDistDir
        try {
            $result = npm start 2>&1
            $exitCode = $LASTEXITCODE
            
            if ($exitCode -eq 0 -or $exitCode -eq 42) {
                Write-Success "JavaScript build tested successfully (exit code: $exitCode)"
            } else {
                Write-Error "JavaScript test failed (exit code: $exitCode)"
                Write-Host $result
                return $false
            }
        }
        finally {
            Pop-Location
        }
    } else {
        Write-Success "JavaScript project ready (run 'npm start' in dist/js to execute)"
    }
    
    return $true
}

# Step 5: Build native C++ project
function Build-Native {
    Write-Step "Step 5/5: Building Native C++ Project"
    
    $nativeDistDir = Join-Path $DistDir "native"
    $cmakeListsPath = Join-Path $nativeDistDir "CMakeLists.txt"
    $nativeBuildDir = Join-Path $nativeDistDir "build"
    
    if (-not (Test-Path $cmakeListsPath)) {
        Write-Info "Generating CMakeLists.txt..."
        
        $cppFiles = Get-ChildItem -Path (Join-Path $nativeDistDir "tuff") -Filter "*.cpp" -Recurse -ErrorAction SilentlyContinue
        if ($cppFiles.Count -eq 0) {
            Write-Error "No C++ files found in dist/native"
            return $false
        }
        
        $relativeFiles = $cppFiles | ForEach-Object { 
            $_.FullName.Substring($nativeDistDir.Length + 1).Replace('\', '/') 
        }
        
        $mainCpp = $relativeFiles | Where-Object { $_ -match 'main\.cpp$' } | Select-Object -First 1
        if (-not $mainCpp) {
            Write-Error "No main.cpp found"
            return $false
        }
        
        $tuffDir = Split-Path $mainCpp -Parent
        $allCppInDir = $relativeFiles | Where-Object { (Split-Path $_ -Parent) -eq $tuffDir }
        $implementationFiles = $allCppInDir | Where-Object { (Split-Path $_ -Leaf) -notin @('main.cpp') }
        $sourcesList = @($mainCpp) + $implementationFiles
        
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
        
        Write-Success "CMakeLists.txt created"
    }
    
    # Build with CMake
    if (-not (Get-Command cmake -ErrorAction SilentlyContinue)) {
        Write-Error "CMake not found - please install CMake"
        return $false
    }
    
    if ($Clean -and (Test-Path $nativeBuildDir)) {
        Write-Info "Cleaning native build directory..."
        Remove-Item $nativeBuildDir -Recurse -Force
    }
    
    if (-not (Test-Path $nativeBuildDir)) {
        New-Item -ItemType Directory -Path $nativeBuildDir -Force | Out-Null
    }
    
    Push-Location $nativeBuildDir
    try {
        Write-Info "Configuring CMake for native build..."
        $output = cmake .. 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Error "CMake configuration failed"
            Write-Host $output
            return $false
        }
        
        Write-Info "Building native executable..."
        $output = cmake --build . --config Release 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Native build failed"
            Write-Host $output
            return $false
        }
        
        $exePath = Get-ChildItem -Path $nativeBuildDir -Filter "program*" -Recurse | 
            Where-Object { $_.Extension -in @('.exe', '') } | 
            Select-Object -First 1
        
        if (-not $exePath) {
            Write-Error "Executable not found after build"
            return $false
        }
        
        Write-Success "Native executable built: $($exePath.Name)"
        
        # Test execution
        if (-not $SkipTests) {
            Write-Info "Testing native build..."
            $testOutput = & $exePath.FullName 2>&1
            $exitCode = $LASTEXITCODE
            
            if ($exitCode -eq 0 -or $exitCode -eq 42) {
                Write-Success "Native build tested successfully (exit code: $exitCode)"
            } else {
                Write-Error "Native test failed (exit code: $exitCode)"
                Write-Host $testOutput
                return $false
            }
        }
        
        return $true
    }
    finally {
        Pop-Location
    }
}

# Main execution
try {
    $startTime = Get-Date
    
    Write-Host ""
    Write-Host "${ColorBold}${ColorCyan}╔════════════════════════════════════════╗${ColorReset}"
    Write-Host "${ColorBold}${ColorCyan}║   Tuff Complete Build Pipeline         ║${ColorReset}"
    Write-Host "${ColorBold}${ColorCyan}╚════════════════════════════════════════╝${ColorReset}"
    Write-Host ""
    
    # Clean dist if requested
    if ($Clean -and (Test-Path $DistDir)) {
        Write-Info "Cleaning dist directory..."
        Remove-Item $DistDir -Recurse -Force
    }
    
    # Execute build steps
    $steps = @(
        @{ Name = "Build-Compiler"; Function = ${function:Build-Compiler} },
        @{ Name = "Compile-ToJavaScript"; Function = ${function:Compile-ToJavaScript} },
        @{ Name = "Compile-ToCpp"; Function = ${function:Compile-ToCpp} },
        @{ Name = "Build-JavaScript"; Function = ${function:Build-JavaScript} },
        @{ Name = "Build-Native"; Function = ${function:Build-Native} }
    )
    
    foreach ($step in $steps) {
        $success = & $step.Function
        if (-not $success) {
            Write-Host ""
            Write-Error "Build pipeline failed at: $($step.Name)"
            exit 1
        }
        Write-Host ""
    }
    
    $endTime = Get-Date
    $duration = $endTime - $startTime
    
    Write-Host "${ColorBold}${ColorGreen}╔════════════════════════════════════════╗${ColorReset}"
    Write-Host "${ColorBold}${ColorGreen}║   Build Pipeline Completed!            ║${ColorReset}"
    Write-Host "${ColorBold}${ColorGreen}╚════════════════════════════════════════╝${ColorReset}"
    Write-Host ""
    Write-Success "Total time: $($duration.TotalSeconds.ToString('F2')) seconds"
    Write-Host ""
    Write-Info "Outputs:"
    Write-Host "  - Compiler: ${ColorGreen}$CompilerPath${ColorReset}"
    Write-Host "  - JavaScript: ${ColorGreen}dist/js/${ColorReset}"
    Write-Host "  - Native: ${ColorGreen}dist/native/${ColorReset}"
    Write-Host ""
    
} catch {
    Write-Host ""
    Write-Error "Build pipeline failed: $_"
    Write-Host $_.ScriptStackTrace
    exit 1
}
