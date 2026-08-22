#requires -Version 7
$ErrorActionPreference = 'Stop'

# Detect duplicated code blocks in Rust sources using PMD CPD.
pmd cpd --language rust --minimum-tokens 100 --dir src
if ($LASTEXITCODE -ne 0) {
    Write-Error "PMD CPD found duplicated code in src/"
    exit 1
}
exit 0
