# Hook: cap the number of children (files + subdirectories) per directory.
Set-Location (Resolve-Path (Join-Path $PSScriptRoot "..\.."))

$cap = 12
$files = git ls-files
if (-not $files) { exit 0 }

# Map each tracked file to its parent directory ("" for repo root).
$parents = $files | ForEach-Object {
    $path = $_ -replace "\\", "/"
    if ($path -match "/") { ($path -split "/")[0..($path.Split("/").Length - 2)] -join "/" } else { "" }
}

$violations = $parents |
    Group-Object |
    Where-Object { $_.Count -gt $cap } |
    ForEach-Object {
        $dir = if ($_.Name) { $_.Name } else { "(repo root)" }
        "$dir has $($_.Count) children (cap: $cap)"
    }

if ($violations) {
    $violations | ForEach-Object { Write-Host $_ }
    Write-Error "Children cap per directory exceeded. Create subdirectories."
    exit 1
}
Write-Host "Children cap OK."
