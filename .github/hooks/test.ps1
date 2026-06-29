# check-coverage.ps1
$result = cmd /c "bun test --coverage --coverage-reporter=lcov 2>&1"

# Filter to only failing test lines
$failures = $result | Where-Object {
    $_ -match '^\s*(✗|×|FAIL|fail|✗|●|rerun|expected|received|error|Error)' -or
    $_ -match 'tests? failed'
}

if ($LASTEXITCODE -ne 0) {
    $failures | Write-Host
    exit 2
}

$seen = $false
$sf = ''
Select-String 'SF:|DA:.*,0' coverage/lcov.info | ForEach-Object {
    if ($_.Line -match 'SF:(.+)') {
        $sf = $Matches[1]
    } elseif ($_.Line -match 'DA:(\d+),0') {
        $ln = [int]$Matches[1]
        $src = (Get-Content $sf)[$ln - 1]
        Write-Host "${sf}:${ln}: $src"
        $seen = $true
    }
}
if ($seen) {
    Write-Host "Insufficient coverage. Add more test cases or remove dead code."
    exit 2
}