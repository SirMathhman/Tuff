# Check for code duplication in main.js
# This script runs jscpd to detect duplicate code blocks

Write-Host "Checking for code duplication in main.js..."
# Run jscpd with minimum token threshold of 35
$output = npx jscpd main.js --min-tokens 35 2>&1 | Out-String

# Check if clones were found by looking for "Clone found" in output
if ($output -match "Clone found") {
    Write-Host "`nCode duplication detected!`n"
    Write-Host $output
    Write-Host "`nIMPORTANT: Fix duplications in main.tuff, NOT in main.js"
    Write-Host "   main.js is generated from main.tuff by the compiler.`n"
    exit 1
} else {
    Write-Host "[OK] No significant code duplication found."
    exit 0
}
