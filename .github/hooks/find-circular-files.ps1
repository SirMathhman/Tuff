#requires -Version 7
$ErrorActionPreference = 'Stop'

# Detect circular dependencies between Rust source files, based on
# `mod` declarations (the only way files depend on each other in a crate).
$files = git ls-files '*.rs'
if ($LASTEXITCODE -ne 0) {
    Write-Error "git ls-files failed"
    exit 1
}

$deps = @{}
foreach ($f in $files) {
    $deps[$f] = @()
    $dir = Split-Path -Parent $f
    $content = Get-Content $f -Raw
    foreach ($m in [regex]::Matches($content, '^\s*(?:pub\s+)?mod\s+([A-Za-z0-9_]+)\s*;')) {
        $candidate = Join-Path $dir ($m.Groups[1].Value + '.rs')
        if (Test-Path $candidate) {
            $deps[$f] += (Resolve-Path $candidate).Path
        }
    }
}

$state = @{}
function Test-Cycle {
    param([string]$node)
    $state[$node] = 1
    foreach ($d in $deps[$node]) {
        if ($state[$d] -eq 1) { return $true }
        if (-not $state.ContainsKey($d) -and (Test-Cycle $d)) { return $true }
    }
    $state[$node] = 2
    return $false
}

foreach ($f in $files) {
    if (-not $state.ContainsKey($f) -and (Test-Cycle $f)) {
        Write-Error "Circular file dependency detected involving '$f'"
        exit 1
    }
}
exit 0
