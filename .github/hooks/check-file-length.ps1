$max = 500
$bad = @()
Get-ChildItem src -Recurse -Include *.rs | ForEach-Object {
    $c = (Get-Content $_.FullName).Count
    if ($c -gt $max) {
        $bad += "$($_.Name) has $c lines (max $max)"
    }
}
if ($bad.Count -gt 0) {
    Write-Host ($bad -join "`n")
    exit 2
}
