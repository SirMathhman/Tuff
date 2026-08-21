# Fails if any directory contains more than $Cap children (files + subdirectories).
# Uses git ls-files so only tracked files are counted.
$ErrorActionPreference = "Stop"

$Cap = 10

$files = git ls-files
if (-not $files) {
    exit 0
}

# Distinct directories that contain at least one tracked file.
$dirs = @{}
foreach ($f in $files) {
    if ($f -match '^(.*)[/\\]') {
        $dirs[$matches[1]] = $true
    }
    else {
        $dirs[""] = $true
    }
}

# Children per directory: files directly inside + subdirectories directly inside.
$children = @{}
foreach ($d in $dirs.Keys) {
    $children[$d] = 0
}
foreach ($f in $files) {
    if ($f -match '^(.*)[/\\]') {
        $children[$matches[1]]++
    }
    else {
        $children[""]++
    }
}
foreach ($d in $dirs.Keys) {
    if ($d -match '^(.*)[/\\]') {
        $children[$matches[1]]++
    }
}

$violations = @()
foreach ($d in $children.Keys) {
    if ($children[$d] -gt $Cap) {
        $label = if ($d) { $d } else { "(repo root)" }
        $violations += "$label : $($children[$d]) children (cap: $Cap)"
    }
}

if ($violations.Count -gt 0) {
    $violations | Write-Error
    Write-Error "Children cap per directory exceeded. Create subdirectories to reduce the count."
    exit 1
}
