param(
    [int]$MinTokens = 60,
    [string]$Dir = "src/"
)

Write-Host "Running PMD CPD: minimum tokens=$MinTokens, dir=$Dir"

if (-not (Get-Command pmd -ErrorAction SilentlyContinue)) {
    Write-Error "pmd CLI not found in PATH. Install PMD and ensure 'pmd' is available."
    exit 2
}

pmd cpd --minimum-tokens $MinTokens --language cpp --dir $Dir --format text
$return = $LASTEXITCODE
if ($return -ne 0) {
    Write-Error "PMD CPD detected duplicates or encountered an error (exit $return)."
    exit $return
}

Write-Host "No duplicates detected."
exit 0
