Write-Host "Running pre-commit checks..." -ForegroundColor Cyan

$maxLines = 500
$violations = @()

# Get all staged files (excluding build artifacts)
$stagedFiles = git diff --cached --name-only --diff-filter=ACM | Where-Object { 
    -not ($_ -match '^bootstrap/build/' -or $_ -match '\.tlog$' -or $_ -match 'CMakeCCompilerId|CMakeCXXCompilerId')
}

foreach ($file in $stagedFiles) {
    if (Test-Path $file) {
        $lineCount = (Get-Content $file -ErrorAction SilentlyContinue | Measure-Object -Line).Lines
        
        if ($lineCount -gt $maxLines) {
            $violations += "  - $file ($lineCount lines)"
        }
    }
}

if ($violations.Count -gt 0) {
    Write-Host "`n❌ Pre-commit check FAILED!" -ForegroundColor Red
    Write-Host "`nThe following files exceed the $maxLines line limit:" -ForegroundColor Yellow
    $violations | ForEach-Object { Write-Host $_ -ForegroundColor Yellow }
    Write-Host "`nPlease split these files into smaller, more manageable modules." -ForegroundColor Yellow
    Write-Host "Each file should focus on a single responsibility.`n" -ForegroundColor Yellow
    exit 1
}

Write-Host "✓ All files are within the $maxLines line limit.`n" -ForegroundColor Green
exit 0
