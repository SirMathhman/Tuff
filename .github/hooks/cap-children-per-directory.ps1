#requires -Version 7
$ErrorActionPreference = 'Stop'

# Fail if any directory tracked in git has more than $cap children
# (files and subdirectories both count).
$cap = 20
$files = git ls-files
if ($LASTEXITCODE -ne 0) {
    Write-Error "git ls-files failed"
    exit 1
}

$children = @{}
foreach ($f in $files) {
    $dir = Split-Path -Parent $f
    if (-not $children.ContainsKey($dir)) { $children[$dir] = @{} }
    $children[$dir][[IO.Path]::GetFileName($f)] = $true
}

$failed = $false
foreach ($dir in $children.Keys | Sort-Object) {
    $count = $children[$dir].Count
    if ($count -gt $cap) {
        Write-Error "Directory '$dir' has $count children (cap: $cap). Create subdirectories."
        $failed = $true
    }
}
if ($failed) { exit 1 }
exit 0
