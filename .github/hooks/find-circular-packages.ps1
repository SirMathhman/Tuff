# Hook: detect circular dependencies between packages (top-level subdirectories).
# Builds on the file-level graph from madge: a file's package is its top-level
# directory (files at the repo root form the "(root)" package).
Set-Location (Resolve-Path (Join-Path $PSScriptRoot "..\.."))

$files = git ls-files "*.ts"
if (-not $files) {
    Write-Host "No TypeScript files to check."
    exit 0
}

$graph = & bunx madge --json --extensions ts $files
if ($LASTEXITCODE -ne 0) {
    Write-Error "madge failed while building the file dependency graph."
    exit 1
}

$packageOf = {
    param($file)
    $path = $file -replace "\\", "/"
    if ($path -match "/") { ($path -split "/")[0] } else { "(root)" }
}

$packageGraph = @{}
foreach ($entry in $graph.PSObject.Properties) {
    $from = & $packageOf $entry.Name
    foreach ($dep in $entry.Value) {
        $to = & $packageOf $dep
        if ($from -ne $to) {
            if (-not $packageGraph.ContainsKey($from)) { $packageGraph[$from] = New-Object System.Collections.Generic.HashSet[string] }
            [void]$packageGraph[$from].Add($to)
        }
    }
}

# DFS cycle detection over the package graph.
$state = @{}   # package -> 1 (visiting) | 2 (done)
$stack = @()
$cycle = $null

function Find-Cycle {
    param([string]$node)
    $script:state[$node] = 1
    $script:stack += $node
    foreach ($next in $packageGraph[$node]) {
        if ($script:state[$next] -eq 1) {
            $start = $script:stack.IndexOf($next)
            $script:cycle = ($script:stack[$start..($script:stack.Count - 1)] + $next) -join " -> "
            return
        }
        if (-not $script:state.ContainsKey($next)) {
            Find-Cycle $next
            if ($script:cycle) { return }
        }
    }
    $script:stack = $script:stack[0..($script:stack.Count - 2)]
    $script:state[$node] = 2
}

foreach ($pkg in $packageGraph.Keys) {
    if (-not $state.ContainsKey($pkg)) {
        Find-Cycle $pkg
        if ($cycle) { break }
    }
}

if ($cycle) {
    Write-Host "Circular package dependency: $cycle"
    Write-Error "Circular dependency between packages found. Move files or content appropriately."
    exit 1
}
Write-Host "No circular package dependencies."
