param(
    [string]$CCompiler = "",
    [string]$Out = "run_tests.exe"
)

if (-not $CCompiler) {
    $clang = Get-Command clang -ErrorAction SilentlyContinue
    if ($clang) { $CCompiler = "clang" }
    else {
        $gcc = Get-Command gcc -ErrorAction SilentlyContinue
        if ($gcc) { $CCompiler = "gcc" }
        else { Write-Error "No C compiler found (clang or gcc required)."; exit 1 }
    }
}

Write-Host "Using C compiler: $CCompiler"

$src = "src/interpret.c"
$tests = "tests/test_interpret.c"
$unity = "tests/vendor/unity.c"

$cmd = "$CCompiler -std=c99 -Wall -Wextra -Werror -O0 -g -o $Out $tests $src $unity"
Write-Host "Compiling: $cmd"

$rv = & $CCompiler -std=c99 -Wall -Wextra -Werror -O0 -g -o $Out $tests $src $unity
if ($LASTEXITCODE -ne 0) { Write-Error "Compilation failed"; exit $LASTEXITCODE }

Write-Host "Running tests: .\$Out"
& .\$Out
$exitCode = $LASTEXITCODE
if ($exitCode -ne 0) { Write-Error "Tests failed with exit code $exitCode"; exit $exitCode }
Write-Host "ALL TESTS PASSED"
exit 0
