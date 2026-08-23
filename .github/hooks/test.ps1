#requires -Version 7
$ErrorActionPreference = 'Stop'

# Run the test suite with line coverage and fail if line coverage is below 95%.
$output = cargo llvm-cov 2>&1
$exitCode = $LASTEXITCODE
$output | ForEach-Object { Write-Host $_ }
if ($exitCode -ne 0) {
    Write-Error "cargo llvm-cov failed"
    exit 1
}

$totalLine = $output | Where-Object { $_ -match '^TOTAL' } | Select-Object -First 1
if (-not $totalLine) {
    Write-Error "could not find TOTAL line in coverage summary"
    exit 1
}
# Columns: TOTAL Regions MissedRegions RegionCov Functions MissedFunctions
#          FunctionCov Lines MissedLines LineCov Branches MissedBranches BranchCov
$fields = $totalLine -split '\s+'
if ($fields.Count -lt 10 -or $fields[9] -notmatch '^(\d+(?:\.\d+)?)%$') {
    Write-Error "could not parse line coverage from the coverage summary"
    exit 1
}
$coverage = [double]$Matches[1]
if ($coverage -lt 95.0) {
    Write-Error "line coverage ${coverage}% is below the 95% threshold"
    exit 1
}
exit 0
