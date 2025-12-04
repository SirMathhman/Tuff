# Pre-commit hook to enforce maximum file line count of 500 lines (Windows PowerShell)
# Excludes: target/, .git/, .githooks/, and hidden directories

$MAX_LINES = 500
$EXCLUDED_DIRS = @('target', '.git', '.githooks', 'node_modules', '.vscode', '.idea')
$VIOLATIONS = @()

# Function to check if a path is in excluded directories
function Is-Excluded {
    param([string]$FilePath)
    
    foreach ($excluded in $EXCLUDED_DIRS) {
        if ($FilePath -like "$excluded/*" -or $FilePath -like "$excluded\*") {
            return $true
        }
    }
    
    # Skip hidden files except .gitignore
    if ($FilePath -like ".*" -and $FilePath -ne ".gitignore") {
        return $true
    }
    
    return $false
}

# Get all staged files
$output = & git diff --cached --name-only --diff-filter=ACM 2>$null
$FILES = $output -split "`n" | Where-Object { $_ -ne "" }

if ($FILES.Count -eq 0) {
    exit 0
}

# Check each file
foreach ($file in $FILES) {
    # Skip if it doesn't exist
    if (-not (Test-Path $file -PathType Leaf)) {
        continue
    }

    # Skip if it's in an excluded directory
    if (Is-Excluded $file) {
        continue
    }

    # Count lines in the file
    try {
        $lineCount = (Get-Content $file | Measure-Object -Line).Lines
        if ($null -eq $lineCount) {
            $lineCount = 0
        }
    }
    catch {
        $lineCount = 0
    }

    # Check if it exceeds the limit
    if ($lineCount -gt $MAX_LINES) {
        $VIOLATIONS += "$file ($lineCount lines)"
    }
}

# Report violations
if ($VIOLATIONS.Count -gt 0) {
    Write-Host "Error: The following files exceed $MAX_LINES lines:" -ForegroundColor Red
    foreach ($violation in $VIOLATIONS) {
        Write-Host "  - $violation" -ForegroundColor Yellow
    }
    Write-Host "Please split large files into smaller modules." -ForegroundColor Red
    exit 1
}

Write-Host "All files are within the $MAX_LINES line limit." -ForegroundColor Green
exit 0
