param(
    [int]$TimeoutSeconds
)

Set-StrictMode -Version Latest

# Edit this if you want to change the default test timeout.
$DefaultTimeoutSeconds = 10

if (-not $PSBoundParameters.ContainsKey('TimeoutSeconds')) {
    $TimeoutSeconds = $DefaultTimeoutSeconds
}

$exePath = Join-Path $PSScriptRoot "..\test_interpret"

if (-not (Test-Path $exePath)) {
    Write-Error "Test executable not found: $exePath. Run 'make test' to build it first." 
    exit 2
}

$proc = Start-Process -FilePath $exePath -NoNewWindow -PassThru

try {
    Wait-Process -Id $proc.Id -Timeout $TimeoutSeconds -ErrorAction Stop
    $proc.Refresh()
    exit $proc.ExitCode
}
catch [System.TimeoutException] {
    try { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue } catch {}
    Write-Error "Tests timed out after $TimeoutSeconds seconds."
    exit 124
}
