# Detect circular dependencies between packages (top-level directories) using madge's file graph.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root

$json = bunx madge --json --extensions js,ts .
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$deps = $json | ConvertFrom-Json

function Get-Package([string]$path) {
  $p = $path -replace '\\', '/'
  if ($p -match '^([^/]+)/') { return $Matches[1] }
  return '(root)'
}

# Aggregate the file-level graph to a package-level graph.
$graph = @{}
foreach ($file in $deps.PSObject.Properties) {
  $from = Get-Package $file.Name
  foreach ($d in @($file.Value)) {
    $to = Get-Package $d
    if ($from -ne $to) {
      if (-not $graph[$from]) { $graph[$from] = @{} }
      $graph[$from][$to] = $true
    }
  }
}

# DFS cycle detection.
$state = @{}
$cycle = $null
function Test-Cycle([string]$node) {
  $script:state[$node] = 1
  if ($script:graph[$node]) {
    foreach ($next in @($script:graph[$node].Keys)) {
      if ($script:state[$next] -eq 1) {
        $script:cycle = "$node -> $next"
        return $true
      }
      if (-not $script:state[$next] -and (Test-Cycle $next)) { return $true }
    }
  }
  $script:state[$node] = 2
  return $false
}
foreach ($n in @($graph.Keys)) {
  if (-not $script:state[$n] -and (Test-Cycle $n)) { break }
}

if ($cycle) {
  Write-Error "Circular dependency between packages: $cycle"
  exit 1
}
exit 0
