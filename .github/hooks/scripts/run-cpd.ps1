param()

$ProjectRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
$SrcDir = Join-Path $ProjectRoot "src"

# Helper: pipe to stderr so agent sees it
function Write-Stderr { $input | ForEach-Object { $host.ui.WriteErrorLine($_) } }

Write-Stderr "Checking for code duplication (PMD CPD)..."

# Run PMD CPD (--no-fail-on-error to skip parse errors in headers, actual duplication still exits non-zero)
$result = & "pmd" "cpd" "--dir" $SrcDir "--language" "cpp" "--minimum-tokens" "50" "--ignore-literals" "--ignore-identifiers" "--no-fail-on-error" 2>&1
$output = $result | Out-String

# Write all output to stderr
$host.ui.WriteErrorLine($output)

if ($LASTEXITCODE -ne 0)
{
    $host.ui.WriteErrorLine("FAILED: Duplicate code detected (exit code $LASTEXITCODE).")
    '{ "hookSpecificOutput": { "stopReason": "Duplicate code detected by PMD CPD" } }'
    exit 2
}

$host.ui.WriteErrorLine("PASSED: No duplicate code found.")

# Signal continue on stdout
'{ "hookSpecificOutput": { "continue": true } }'