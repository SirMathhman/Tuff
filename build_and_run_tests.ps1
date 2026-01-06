$ErrorActionPreference = "Stop"
# Prefer clang; fall back to gcc if clang is unavailable.
$cc = $null
if (Get-Command clang -ErrorAction SilentlyContinue) { $cc = "clang" }
elseif (Get-Command gcc -ErrorAction SilentlyContinue) { $cc = "gcc" }
else {
    Write-Error "clang or gcc not found in PATH. Please install clang or MinGW and ensure a C compiler is in PATH."
    exit 1
}
$srcFiles = @("src\interpret.c", "src\parser.c", "src\symbols.c")
$test = "tests\test_interpret.c"
$binDir = "build"
$bin = "$binDir\test_interpret.exe"
New-Item -ItemType Directory -Force -Path $binDir | Out-Null
# Compile with include dir and common warning flags
& $cc -Iinclude -Wall -Wextra -std=c11 $srcFiles $test -o $bin
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& .\$bin
