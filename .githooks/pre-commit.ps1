Write-Host "Running pre-commit checks..." -ForegroundColor Cyan

$maxLines = 500
$maxFilesPerDir = 15
$violations = @()
$dirViolations = @()

# Directories to ignore (build artifacts, hidden dirs, etc.)
$ignoreDirs = @(
    'bootstrap/build',
    '\.git',
    'node_modules',
    '\.vscode'
)

# Get all staged files (excluding build artifacts)
$stagedFiles = git diff --cached --name-only --diff-filter=ACM | Where-Object { 
    $file = $_
    -not ($file -match '^bootstrap/build/' -or $file -match '\.tlog$' -or $file -match 'CMakeCCompilerId|CMakeCXXCompilerId')
}

# Check file line counts
foreach ($file in $stagedFiles) {
    if (Test-Path $file) {
        $lineCount = (Get-Content $file -ErrorAction SilentlyContinue | Measure-Object -Line).Lines
        
        if ($lineCount -gt $maxLines) {
            $violations += "  - $file ($lineCount lines)"
        }
    }
}

# Check directory file counts (direct files only, ignore subdirectories)
$directories = @()
foreach ($file in $stagedFiles) {
    $dir = Split-Path -Parent $file
    if ([string]::IsNullOrEmpty($dir)) {
        $dir = "."
    }
    if ($directories -notcontains $dir) {
        $directories += $dir
    }
}

foreach ($dir in $directories) {
    # Check if directory should be ignored
    $shouldIgnore = $false
    foreach ($ignoreDir in $ignoreDirs) {
        if ($dir -match $ignoreDir) {
            $shouldIgnore = $true
            break
        }
    }
    
    if (-not $shouldIgnore) {
        # Count direct files in directory (not subdirectories)
        $fileCount = 0
        if (Test-Path $dir) {
            $fileCount = @(Get-ChildItem -Path $dir -File -ErrorAction SilentlyContinue).Count
            if ($fileCount -eq 0 -and (Get-ChildItem -Path $dir -File -ErrorAction SilentlyContinue)) {
                $fileCount = 1
            }
        }
        
        if ($fileCount -gt $maxFilesPerDir) {
            $dirViolations += "  - $dir ($fileCount files, max $maxFilesPerDir)"
        }
    }
}

# Report violations
$hasViolations = $false

if ($violations.Count -gt 0) {
    $hasViolations = $true
    Write-Host "`n❌ File size check FAILED!" -ForegroundColor Red
    Write-Host "`nThe following files exceed the $maxLines line limit:" -ForegroundColor Yellow
    $violations | ForEach-Object { Write-Host $_ -ForegroundColor Yellow }
    Write-Host "`nPlease split these files into smaller, more manageable modules." -ForegroundColor Yellow
    Write-Host "Each file should focus on a single responsibility.`n" -ForegroundColor Yellow
}

if ($dirViolations.Count -gt 0) {
    $hasViolations = $true
    Write-Host "`n❌ Directory organization check FAILED!" -ForegroundColor Red
    Write-Host "`nThe following directories exceed the $maxFilesPerDir file limit:" -ForegroundColor Yellow
    $dirViolations | ForEach-Object { Write-Host $_ -ForegroundColor Yellow }
    Write-Host "`nPlease organize files into subdirectories to keep directories manageable." -ForegroundColor Yellow
    Write-Host "Each directory should contain at most $maxFilesPerDir direct files.`n" -ForegroundColor Yellow
}

if ($hasViolations) {
    exit 1
}

Write-Host "✓ All files are within the $maxLines line limit." -ForegroundColor Green
Write-Host "✓ All directories have $maxFilesPerDir or fewer direct files.`n" -ForegroundColor Green
exit 0
