# SafeC Compiler Build Script for Windows

param(
    [switch]$Clean,
    [switch]$Test,
    [switch]$TestLexer,
    [switch]$TestParser,
    [switch]$TestCodegen,
    [switch]$Help
)

$BuildDir = "build"
$SrcDir = "src"
$TestDir = "tests"
$CC = "clang"
$CFLAGS = "-Wall -Wextra -std=c99 -g"

function Show-Help {
    Write-Host "SafeC Compiler Build Script"
    Write-Host ""
    Write-Host "Usage: .\build.ps1 [options]"
    Write-Host ""
    Write-Host "Options:"
    Write-Host "  -Clean       Clean build directory"
    Write-Host "  -Test        Run all tests"
    Write-Host "  -TestLexer   Run lexer tests only"
    Write-Host "  -TestParser  Run parser tests only"
    Write-Host "  -TestCodegen Run codegen tests only"
    Write-Host "  -Help        Show this help message"
}

function Clean-Build {
    if (Test-Path $BuildDir) {
        Remove-Item -Recurse -Force $BuildDir
        Write-Host "Cleaned build directory"
    }
}

function Ensure-BuildDir {
    if (-not (Test-Path $BuildDir)) {
        New-Item -ItemType Directory -Path $BuildDir | Out-Null
    }
}

function Build-Object {
    param([string]$Source, [string]$Object)
    
    $cmd = "$CC $CFLAGS -c $Source -o $Object"
    Write-Host "Compiling: $Source"
    Invoke-Expression $cmd
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Compilation failed for $Source"
        exit 1
    }
}

function Build-Executable {
    param([string[]]$Objects, [string]$Output)
    
    $objStr = $Objects -join " "
    $cmd = "$CC $objStr -o $Output"
    Write-Host "Linking: $Output"
    Invoke-Expression $cmd
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Linking failed for $Output"
        exit 1
    }
}

function Build-Compiler {
    Ensure-BuildDir
    
    # Compile source files
    Build-Object "$SrcDir/lexer.c" "$BuildDir/lexer.o"
    Build-Object "$SrcDir/ast.c" "$BuildDir/ast.o"
    Build-Object "$SrcDir/parser.c" "$BuildDir/parser.o"
    Build-Object "$SrcDir/codegen.c" "$BuildDir/codegen.o"
    Build-Object "$SrcDir/main.c" "$BuildDir/main.o"
    
    # Link
    Build-Executable @(
        "$BuildDir/lexer.o",
        "$BuildDir/ast.o",
        "$BuildDir/parser.o",
        "$BuildDir/codegen.o",
        "$BuildDir/main.o"
    ) "$BuildDir/safec.exe"
    
    Write-Host "Build complete: $BuildDir/safec.exe"
}

function Build-And-Run-LexerTest {
    Ensure-BuildDir
    Build-Object "$SrcDir/lexer.c" "$BuildDir/lexer.o"
    
    $cmd = "$CC $CFLAGS $TestDir/test_lexer.c $BuildDir/lexer.o -o $BuildDir/test_lexer.exe"
    Write-Host "Building lexer tests..."
    Invoke-Expression $cmd
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to build lexer tests"
        exit 1
    }
    
    Write-Host ""
    & "$BuildDir/test_lexer.exe"
    $script:lexerExitCode = $LASTEXITCODE
    return $script:lexerExitCode
}

function Build-And-Run-ParserTest {
    Ensure-BuildDir
    Build-Object "$SrcDir/lexer.c" "$BuildDir/lexer.o"
    Build-Object "$SrcDir/ast.c" "$BuildDir/ast.o"
    Build-Object "$SrcDir/parser.c" "$BuildDir/parser.o"
    
    $cmd = "$CC $CFLAGS $TestDir/test_parser.c $BuildDir/lexer.o $BuildDir/ast.o $BuildDir/parser.o -o $BuildDir/test_parser.exe"
    Write-Host "Building parser tests..."
    Invoke-Expression $cmd
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to build parser tests"
        exit 1
    }
    
    Write-Host ""
    & "$BuildDir/test_parser.exe"
    $script:parserExitCode = $LASTEXITCODE
    return $script:parserExitCode
}

function Build-And-Run-CodegenTest {
    Ensure-BuildDir
    Build-Object "$SrcDir/lexer.c" "$BuildDir/lexer.o"
    Build-Object "$SrcDir/ast.c" "$BuildDir/ast.o"
    Build-Object "$SrcDir/parser.c" "$BuildDir/parser.o"
    Build-Object "$SrcDir/codegen.c" "$BuildDir/codegen.o"
    
    $cmd = "$CC $CFLAGS $TestDir/test_codegen.c $BuildDir/lexer.o $BuildDir/ast.o $BuildDir/parser.o $BuildDir/codegen.o -o $BuildDir/test_codegen.exe"
    Write-Host "Building codegen tests..."
    Invoke-Expression $cmd
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to build codegen tests"
        exit 1
    }
    
    Write-Host ""
    & "$BuildDir/test_codegen.exe"
    $script:codegenExitCode = $LASTEXITCODE
    return $script:codegenExitCode
}

# Main logic
if ($Help) {
    Show-Help
    exit 0
}

if ($Clean) {
    Clean-Build
    exit 0
}

if ($TestLexer) {
    $result = Build-And-Run-LexerTest
    exit $result
}

if ($TestParser) {
    $result = Build-And-Run-ParserTest
    exit $result
}

if ($TestCodegen) {
    $result = Build-And-Run-CodegenTest
    exit $result
}

if ($Test) {
    Write-Host "=== Running All Tests ==="
    Write-Host ""
    
    Build-And-Run-LexerTest | Out-Null
    $lexerResult = $script:lexerExitCode
    Write-Host ""
    
    Build-And-Run-ParserTest | Out-Null
    $parserResult = $script:parserExitCode
    Write-Host ""
    
    Build-And-Run-CodegenTest | Out-Null
    $codegenResult = $script:codegenExitCode
    Write-Host ""
    
    if ($lexerResult -eq 0 -and $parserResult -eq 0 -and $codegenResult -eq 0) {
        Write-Host "=== All tests passed! ===" -ForegroundColor Green
        exit 0
    } else {
        Write-Host "=== Some tests failed ===" -ForegroundColor Red
        exit 1
    }
}

# Default: build the compiler
Build-Compiler
