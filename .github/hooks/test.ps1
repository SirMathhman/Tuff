#requires -Version 7
$ErrorActionPreference = 'Stop'

# Run the test suite and fail on a non-zero exit code.
$output = cargo test 2>&1
$exitCode = $LASTEXITCODE
$output | ForEach-Object { Write-Host $_ }
if ($exitCode -ne 0) {
    Write-Error "cargo test failed"
    exit 1
}
exit 0
