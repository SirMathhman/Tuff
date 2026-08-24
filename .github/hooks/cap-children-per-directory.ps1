# Fail if any directory has more than 10 direct children (files and subdirectories).
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root

$files = git ls-files
if (-not $files) { exit 0 }
$files = @($files) | ForEach-Object { $_ -replace '\\', '/' }

# Every directory that contains (or is an ancestor of) a tracked file.
$allDirs = @{}
foreach ($f in $files) {
    $parts = $f -split '/'
    for ($i = 1; $i -lt $parts.Count; $i++) {
        $allDirs[($parts[0..($i - 1)] -join '/')] = $true
    }
}

# Direct children per directory: files plus immediate subdirectories.
$children = @{}
foreach ($f in $files) {
    $dir = if ($f -match '^(.+)/[^/]+$') { $Matches[1] } else { '' }
    if (-not $children[$dir]) { $children[$dir] = @{} }
    $inner = $children[$dir]
    $leaf = Split-Path $f -Leaf
    $inner[$leaf] = $true
}
foreach ($d in $allDirs.Keys) {
    if (-not $children[$d]) { $children[$d] = @{} }
    $inner = $children[$d]
    $dDepth = if ($d -eq '') { 0 } else { ($d -split '/').Count }
    foreach ($sub in $allDirs.Keys) {
        if ($sub -ne '' -and ($sub -split '/').Count -eq $dDepth + 1 -and $sub.StartsWith("$d/")) {
            $leaf = Split-Path $sub -Leaf
            $inner[$leaf] = $true
        }
    }
}

$violations = foreach ($d in $allDirs.Keys) {
    $count = $children[$d].Count
    if ($count -gt 10) {
        [pscustomobject]@{ Directory = if ($d -eq '') { '(root)' } else { $d }; Count = $count }
    }
}
if ($violations) {
    $violations | Sort-Object Count -Descending | ForEach-Object {
        Write-Error ("Directory '{0}' has {1} children (max 10). Create subdirectories." -f $_.Directory, $_.Count)
    }
    exit 1
}
exit 0
# Fails when a directory holds more than $Cap tracked files (children cap).
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))

$Cap = 20
$files = git ls-files
$counts = @{}
foreach ($file in $files) {
    $dir = if ($file -match '^(.*)\\') { $Matches[1] } else { '.' }
    $counts[$dir] = [int]$counts[$dir] + 1
}
$violations = $counts.GetEnumerator() | Where-Object { $_.Value -gt $Cap }
if ($violations) {
    foreach ($v in $violations) {
        Write-Error ("Directory '{0}' has {1} files (cap: {2}). Create sub directories." -f $v.Key, $v.Value, $Cap)
    }
    exit 2
}
