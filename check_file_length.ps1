# Check that all Rust source files are under 550 lines
$MaxLines = 550
$Failed = $false

Get-ChildItem -Path src -Filter '*.rs' | ForEach-Object {
    $lines = @(Get-Content $_.FullName).Count
    if ($lines -gt $MaxLines) {
        Write-Host "ERROR: $($_.Name) has $lines lines (max $MaxLines)"
        $Failed = $true
    } else {
        Write-Host "$($_.Name): $lines lines (OK)"
    }
}

if ($Failed) {
    exit 1
} else {
    exit 0
}
