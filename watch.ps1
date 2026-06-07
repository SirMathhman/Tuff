$watchPath = Join-Path $PSScriptRoot "src"
$global:lastRun = [datetime]::MinValue
$global:rebuildQueued = $false

# Register a FileSystemWatcher that flags a rebuild when a .rs or .tuff file changes
$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = $watchPath
$watcher.IncludeSubdirectories = $true
$watcher.NotifyFilter = [System.IO.NotifyFilters]'LastWrite,FileName'
$watcher.EnableRaisingEvents = $true

$action = {
    if ($Event.SourceEventArgs.Name -notmatch '\.(rs|tuff)$') { return }
    $global:rebuildQueued = $true
}

Register-ObjectEvent $watcher "Changed" -Action $action | Out-Null
Register-ObjectEvent $watcher "Created" -Action $action | Out-Null

Write-Host "Watching $watchPath for changes... (Ctrl+C to stop)" -ForegroundColor Green

# Run once immediately
cargo run -- src/main.tuff

while ($true) {
    if ($global:rebuildQueued -and ((Get-Date) - $global:lastRun).TotalMilliseconds -gt 500) {
        $global:rebuildQueued = $false
        $global:lastRun = Get-Date
        Write-Host "`n  Change detected, rebuilding..." -ForegroundColor Cyan
        cargo run -- src/main.tuff
        Write-Host "  Watching for changes... (Ctrl+C to stop)" -ForegroundColor Green
    }
    Start-Sleep -Milliseconds 200
}