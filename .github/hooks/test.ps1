# Hook: run the test suite with coverage and a timeout.
Set-Location (Resolve-Path (Join-Path $PSScriptRoot "..\.."))

$timeoutSeconds = 120
$process = Start-Process -FilePath "bun" -ArgumentList "test", "--timeout", "30000", "--coverage" -NoNewWindow -PassThru -Wait
if ($process.ExitCode -ne 0) {
    Write-Error "Tests failed."
    exit 1
}
if ($process.ExitCode -eq 0 -and $null -ne (Get-Process -Id $process.Id -ErrorAction SilentlyContinue)) {
    Write-Error "Tests timed out after ${timeoutSeconds}s."
    exit 1
}
Write-Host "Tests passed."
