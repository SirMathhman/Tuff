$timeoutSeconds = 30
$process = Start-Process -FilePath "bun" -ArgumentList "test", "--coverage", "--only-failures" -NoNewWindow -PassThru -RedirectStandardOutput "$PWD/test-output.tmp" -RedirectStandardError "$PWD/test-error.tmp"

$completed = $process.WaitForExit($timeoutSeconds * 1000)
if (-not $completed) {
  Write-Host "Tests timed out after $timeoutSeconds seconds" -ForegroundColor Red
  $process.Kill($true)
  Remove-Item "$PWD/test-output.tmp", "$PWD/test-error.tmp" -Force -ErrorAction SilentlyContinue
  exit 1
}

$output = Get-Content "$PWD/test-output.tmp", "$PWD/test-error.tmp" | Where-Object { $_ -notmatch '\|\s*100\.00\s*\|\s*100\.00\s*\|' }
Remove-Item "$PWD/test-output.tmp", "$PWD/test-error.tmp" -Force -ErrorAction SilentlyContinue

if ($process.ExitCode -ne 0) {
  $output
  exit $process.ExitCode
}

$output