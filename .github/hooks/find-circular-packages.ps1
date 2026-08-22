#requires -Version 7
$ErrorActionPreference = 'Stop'

# Detect circular dependencies between packages (crates) using
# cargo metadata's dependency graph.
$metadata = cargo metadata --format-version 1
if ($LASTEXITCODE -ne 0) {
    Write-Error "cargo metadata failed"
    exit 1
}
$meta = $metadata | ConvertFrom-Json

$deps = @{}
foreach ($p in $meta.packages) {
    $deps[$p.name] = @($p.dependencies | ForEach-Object { $_.name })
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

foreach ($name in $deps.Keys) {
    if (-not $state.ContainsKey($name) -and (Test-Cycle $name)) {
        Write-Error "Circular package dependency detected involving '$name'"
        exit 1
    }
}
exit 0
