# Enforce the architecture doc's hygiene limits:
#   - no function longer than 100 lines (clang-tidy readability-function-size)
#   - no source file longer than 500 code lines
#   - no build artifacts (*.exe) tracked in git
# Exits non-zero on any violation.
$ErrorActionPreference = "Stop"
Set-Location (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent)

$files = Get-ChildItem -Path . -Include *.c,*.h -Recurse -File |
    Where-Object { $_.FullName -notmatch '\\\.git\\' }
if (-not $files) { exit 0 }

# 1) Function size via clang-tidy (config in .clang-tidy).
& clang-tidy ($files.FullName) --quiet
if ($LASTEXITCODE -ne 0) {
    Write-Error "clang-tidy reported violations."
    exit 1
}

# 2) File size: at most 500 code lines (non-blank, non-comment-only).
foreach ($f in $files) {
    $codeLines = (Get-Content $f.FullName |
        Where-Object { $_.Trim() -ne '' -and $_.Trim() -notmatch '^(//|/\*|\*)' }).Count
    if ($codeLines -gt 500) {
        Write-Error "$($f.Name) has $codeLines code lines (limit 500)."
        exit 1
    }
}

# 3) No committed build artifacts.
$trackedExe = git ls-files '*.exe'
if ($trackedExe) {
    Write-Error "Build artifacts are tracked in git: $trackedExe"
    exit 1
}
