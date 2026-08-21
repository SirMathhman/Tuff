# Detects circular dependencies between packages (subdirectories) using madge.
# Builds a directory-level dependency graph from madge's JSON output and
# reports any cycle between directories.
$ErrorActionPreference = "Stop"

$files = git ls-files "*.ts"
if (-not $files) {
    exit 0
}

$json = bunx madge --json --extensions ts . 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Error "madge failed to build the dependency graph."
    exit 1
}

$graph = $json | ConvertFrom-Json

function Get-Package([string]$path) {
    $segments = $path -split "/"
    if ($segments.Count -gt 1) { return $segments[0] }
    return "."
}

$edges = @{}
foreach ($file in $graph.PSObject.Properties.Name) {
    $from = Get-Package $file
    foreach ($dep in @($graph.$file)) {
        if (-not $dep) { continue }
        $to = Get-Package $dep
        if ($from -ne $to) {
            if (-not $edges.ContainsKey($from)) { $edges[$from] = @() }
            if ($edges[$from] -notcontains $to) { $edges[$from] += $to }
        }
    }
}

$color = @{}
$stack = [System.Collections.Generic.List[string]]::new()
$cycle = $null

function Find-Cycle([string]$node) {
    if ($script:cycle) { return }
    $script:color[$node] = 1
    $script:stack.Add($node)
    foreach ($next in @($script:edges[$node])) {
        if (-not $next) { continue }
        if ($script:cycle) { break }
        if (-not $script:color.ContainsKey($next)) {
            Find-Cycle $next
        }
        elseif ($script:color[$next] -eq 1) {
            $idx = $script:stack.IndexOf($next)
            $script:cycle = @($script:stack | Select-Object -Skip $idx) + $next
        }
    }
    $script:stack.RemoveAt($script:stack.Count - 1)
    $script:color[$node] = 2
}

foreach ($node in $edges.Keys) {
    if (-not $color.ContainsKey($node)) { Find-Cycle $node }
    if ($cycle) { break }
}

if ($cycle) {
    Write-Error ("Circular dependency between packages: " + ($cycle -join " > "))
    exit 1
}
