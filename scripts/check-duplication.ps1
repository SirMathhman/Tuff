# Check for code duplication in main.js
# This script runs jscpd to detect duplicate code blocks

Write-Host "Checking for code duplication in main.js..." -ForegroundColor Cyan

# Run jscpd with minimum token threshold of 35
$output = npx jscpd main.js --min-tokens 35 2>&1 | Out-String

# Check if clones were found by looking for "Clone found" in output
if ($output -match "Clone found") {
    Write-Host "`nCode duplication detected!`n" -ForegroundColor Red
    Write-Host $output
    Write-Host "`n⚠️  IMPORTANT: Fix duplications in main.tuff, NOT in main.js" -ForegroundColor Yellow
    Write-Host "   main.js is generated from main.tuff by the compiler.`n" -ForegroundColor Yellow
    exit 1
} else {
    Write-Host "[OK] No significant code duplication found." -ForegroundColor Green
    exit 0
}
