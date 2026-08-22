#requires -Version 7
$ErrorActionPreference = 'Stop'

# Run the test suite with a timeout.
$job = Start-Job -ScriptBlock { cargo test 2>&1 }
$done = Wait-Job -Job $job -Timeout 300
if (-not $done) {
    Stop-Job -Job $job
    Remove-Job -Job $job -Force
    Write-Error "cargo test timed out after 300s"
    exit 1
}
$output = Receive-Job -Job $job
Remove-Job -Job $job -Force
$output | ForEach-Object { Write-Host $_ }
if ($job.State -eq 'Failed') { exit 1 }
exit 0
