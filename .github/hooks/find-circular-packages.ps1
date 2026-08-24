# Detects circular dependencies between packages (subdirectories) using madge.
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))

$raw = bunx madge . --json --extensions js, mjs, cjs, ts
if ($LASTEXITCODE -ne 0) {
    Write-Error 'madge failed while building the dependency graph.'
    exit 2
}
$graph = $raw | ConvertFrom-Json

# Map each file to its package (top-level subdirectory; root files are their own package).
$pkgOf = @{}
foreach ($file in $graph.PSObject.Properties.Name) {
    $rel = $file -replace '/', '\'
    $parts = $rel -split '\\'
    if ($parts.Count -gt 1 -and $parts[0] -ne 'node_modules') { $pkgOf[$file] = $parts[0] } else { $pkgOf[$file] = $file }
}

# Build the package-level graph.
$pkgGraph = @{}
foreach ($file in $graph.PSObject.Properties.Name) {
    $from = $pkgOf[$file]
    foreach ($dep in $graph.$file) {
        if (-not $pkgOf.ContainsKey($dep)) { continue }
        $to = $pkgOf[$dep]
        if ($from -eq $to) { continue }
        if (-not $pkgGraph.ContainsKey($from)) { $pkgGraph[$from] = New-Object 'System.Collections.Generic.List[string]' }
        if (-not $pkgGraph[$from].Contains($to)) { $pkgGraph[$from].Add($to) }
    }
}

# Cycle detection (DFS).
$state = @{}
$stack = New-Object 'System.Collections.Generic.List[string]'
$cycle = $null
function Find-PkgCycle {
    param([string]$node)
    $script:state[$node] = 1
    $script:stack.Add($node)
    foreach ($next in @($script:pkgGraph[$node])) {
        if ($script:state[$next] -eq 1) {
            $i = $script:stack.IndexOf($next)
            $script:cycle = @($script:stack[$i..($script:stack.Count - 1)]) + @($next)
            return
        }
        if (-not $script:state.ContainsKey($next)) {
            Find-PkgCycle $next
            if ($script:cycle) { return }
        }
    }
    $script:stack.RemoveAt($script:stack.Count - 1)
    $script:state[$node] = 2
}
foreach ($pkg in @($pkgGraph.Keys)) {
    if (-not $state.ContainsKey($pkg)) {
        Find-PkgCycle $pkg
        if ($cycle) { break }
    }
}
if ($cycle) {
    Write-Error ('Circular dependency between packages found: {0}' -f ($cycle -join ' -> '))
    exit 2
}
