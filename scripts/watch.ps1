#!/usr/bin/env pwsh

# Watch mode for lib.tuff and interpret.c - reruns ./scripts/run.ps1 when either file changes
# Usage: ./scripts/watch.ps1

$files = @(".\lib.tuff", ".\interpret.c")
$script = ".\scripts\run.ps1"
$debounceMs = 500  # Wait 500ms to avoid multiple triggers for rapid saves

foreach ($file in $files) {
    if (-not (Test-Path $file)) {
        Write-Error "File not found: $file"
        exit 1
    }
}

Write-Host "Watching $($files -join ', ') for changes..." -ForegroundColor Green
Write-Host "Press Ctrl+C to stop" -ForegroundColor Yellow
Write-Host ""

function Get-CombinedHash {
    param([string[]]$FilePaths)
    $combined = ""
    foreach ($path in $FilePaths) {
        $combined += (Get-FileHash $path).Hash
    }
    return (Get-StringHash $combined).Hash
}

function Get-StringHash {
    param([string]$String)
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($String)
    $stream = [System.IO.MemoryStream]::new($bytes)
    $hash = Get-FileHash -InputStream $stream -Algorithm SHA256
    $stream.Dispose()
    return $hash
}

$lastRun = [System.DateTime]::MinValue
$lastHash = Get-CombinedHash -FilePaths $files

# Run immediately on startup
Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Running on startup..." -ForegroundColor Cyan
& $script
$lastHash = Get-CombinedHash -FilePaths $files
$lastRun = [System.DateTime]::UtcNow

while ($true) {
    Start-Sleep -Milliseconds 100
    
    try {
        $currentHash = Get-CombinedHash -FilePaths $files
        
        if ($currentHash -ne $lastHash) {
            # Debounce: only run if enough time has passed
            $timeSinceLastRun = ([System.DateTime]::UtcNow - $lastRun).TotalMilliseconds
            
            if ($timeSinceLastRun -ge $debounceMs) {
                Write-Host ""
                Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Files changed, running..." -ForegroundColor Cyan
                & $script
                Write-Host ""
                
                $lastHash = Get-CombinedHash -FilePaths $files
                $lastRun = [System.DateTime]::UtcNow
            }
        }
    }
    catch {
        Write-Error "Error checking files: $_"
    }
}
