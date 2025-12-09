param(
    [int]$MaxComplexity = 15,
    [string]$Dir = "src/"
)

Write-Host "Running Lizard Cyclomatic Complexity Check: max=$MaxComplexity, dir=$Dir"

if (-not (Get-Command lizard -ErrorAction SilentlyContinue)) {
    Write-Error "lizard not found in PATH. Install lizard: pip install lizard"
    exit 2
}

if (-not (Test-Path $Dir)) {
    Write-Error "Directory not found: $Dir"
    exit 2
}

# Run lizard with CCN threshold and output warnings/errors
lizard $Dir --CCN $MaxComplexity --warnings_only
$return = $LASTEXITCODE

if ($return -ne 0) {
    Write-Error "Lizard detected functions with cyclomatic complexity > $MaxComplexity (exit $return)."
    exit $return
}

Write-Host "✓ All functions have cyclomatic complexity <= $MaxComplexity"
exit 0
