# check-coverage.ps1
$result = cmd /c "bun test --coverage --coverage-reporter=lcov 2>&1"
$result | Write-Host

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
    exit 2
}