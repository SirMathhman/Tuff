#!/usr/bin/env pwsh

# Watch mode for lib.tuff - reruns ./scripts/run.ps1 when file changes
# Usage: ./scripts/watch.ps1

$file = ".\lib.tuff"
$script = ".\scripts\run.ps1"
$debounceMs = 500  # Wait 500ms to avoid multiple triggers for rapid saves

if (-not (Test-Path $file)) {
    Write-Error "File not found: $file"
    exit 1
}

Write-Host "Watching $file for changes..." -ForegroundColor Green
Write-Host "Press Ctrl+C to stop" -ForegroundColor Yellow
Write-Host ""

$lastRun = [System.DateTime]::MinValue
$lastHash = (Get-FileHash $file).Hash

# Run immediately on startup
Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Running on startup..." -ForegroundColor Cyan
& $script
$lastHash = (Get-FileHash $file).Hash
$lastRun = [System.DateTime]::UtcNow

while ($true) {
    Start-Sleep -Milliseconds 100
    
    try {
        $currentHash = (Get-FileHash $file).Hash
        
        if ($currentHash -ne $lastHash) {
            # Debounce: only run if enough time has passed
            $timeSinceLastRun = ([System.DateTime]::UtcNow - $lastRun).TotalMilliseconds
            
            if ($timeSinceLastRun -ge $debounceMs) {
                Write-Host ""
                Write-Host "[$(Get-Date -Format 'HH:mm:ss')] File changed, running..." -ForegroundColor Cyan
                & $script
                Write-Host ""
                
                $lastHash = $currentHash
                $lastRun = [System.DateTime]::UtcNow
            }
        }
    }
    catch {
        Write-Error "Error checking file: $_"
    }
}
