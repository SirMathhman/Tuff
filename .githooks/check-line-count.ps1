# Check line count of tracked files
# Fails if any file exceeds 500 lines (excluding gitignore entries)

Write-Host "Checking line count limit (max 500 lines per file)..." -ForegroundColor Cyan

# Get list of tracked files from git
$trackedFiles = git ls-files --cached 2>$null
if ($null -eq $trackedFiles) {
    Write-Host "Warning: No tracked files found or git command failed" -ForegroundColor Yellow
    exit 0
}

# Parse .gitignore to get exclusion patterns
$ignorePatterns = @()
if (Test-Path .gitignore) {
    $ignorePatterns = Get-Content .gitignore | Where-Object { $_ -and -not $_.StartsWith('#') } | ForEach-Object { $_.Trim() }
}

# Function to check if a file matches any ignore pattern
function Test-IgnorePath {
    param([string]$FilePath)
    foreach ($pattern in $ignorePatterns) {
        if ($FilePath -like $pattern) {
            return $true
        }
        # Handle wildcard patterns like "target/*"
        if ($pattern -match '\*' -and $FilePath -like ($pattern -replace '\*', '*')) {
            return $true
        }
    }
    return $false
}

$exceeded = @()
$trackedFiles | ForEach-Object {
    $file = $_
    
    # Skip ignored files
    if (Test-IgnorePath $file) {
        return
    }
    
    # Skip if file doesn't exist (deleted files in index)
    if (-not (Test-Path $file)) {
        return
    }
    
    $lineCount = @(Get-Content $file -ErrorAction SilentlyContinue).Count
    if ($lineCount -eq 0) {
        $lineCount = if ((Get-Content $file -ErrorAction SilentlyContinue) -ne $null) { 1 } else { 0 }
    }
    
    if ($lineCount -gt 500) {
        $exceeded += @{ File = $file; Lines = $lineCount }
    }
}

if ($exceeded.Count -gt 0) {
    Write-Host "Files exceed 500-line limit:" -ForegroundColor Red
    $exceeded | ForEach-Object {
        Write-Host "  $($_.File): $($_.Lines) lines" -ForegroundColor Red
    }
    Write-Host "Please split these files into smaller modules." -ForegroundColor Red
    exit 1
}

Write-Host "All tracked files are within 500-line limit." -ForegroundColor Green
exit 0
