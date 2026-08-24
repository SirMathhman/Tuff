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
  $leaf = Split-Path $f -Leaf
  $children[$dir][$leaf] = $true
}
foreach ($d in $allDirs.Keys) {
  if (-not $children[$d]) { $children[$d] = @{} }
  $dDepth = if ($d -eq '') { 0 } else { ($d -split '/').Count }
  foreach ($sub in $allDirs.Keys) {
    if ($sub -ne '' -and ($sub -split '/').Count -eq $dDepth + 1 -and $sub.StartsWith("$d/")) {
      $leaf = Split-Path $sub -Leaf
      $children[$d][$leaf] = $true
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
