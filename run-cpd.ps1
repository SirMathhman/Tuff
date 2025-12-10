# PMD CPD (Copy/Paste Detector) Runner
# Detects duplicate code in Rust source files
# Token size: 60 (configurable below)

param(
    [int]$MinTokens = 60,
    [string]$Format = "text",
    [string]$SourceDir = "src"
)

$PMD_PATH = ".\pmd-bin-7.8.0\bin\pmd.bat"

if (-not (Test-Path $PMD_PATH)) {
    Write-Error "PMD not found at $PMD_PATH. Please run setup first."
    exit 1
}

Write-Host "Running CPD with minimum tokens: $MinTokens" -ForegroundColor Cyan
Write-Host "Source directory: $SourceDir" -ForegroundColor Cyan
Write-Host ""

& $PMD_PATH cpd `
    --minimum-tokens $MinTokens `
    --language cpp `
    --dir $SourceDir `
    --format $Format `
    --no-fail-on-violation

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nNo duplicates detected! ✓" -ForegroundColor Green
} else {
    Write-Host "`nDuplicates found. See report above." -ForegroundColor Yellow
}
