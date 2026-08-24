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
