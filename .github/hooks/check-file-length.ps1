<#
.SYNOPSIS
    Checks whether any file within ./src exceeds 20,000 characters.

.DESCRIPTION
    Recursively scans ./src for files. Checks total character count rather
    than line count, so the check can't be gamed by compacting multiple
    statements onto fewer lines. If any file exceeds the character limit,
    prints a message saying that file must be split into parts, and exits
    with code 2. If all files are within the limit, exits with code 0.
#>

$maxChars = 20000
$srcPath = Join-Path -Path $PWD -ChildPath "src"

if (-not (Test-Path -Path $srcPath)) {
    Write-Error "Path '$srcPath' does not exist."
    exit 1
}

$files = Get-ChildItem -Path $srcPath -Recurse -File

$violations = @()

foreach ($file in $files) {
    $charCount = (Get-Content -Path $file.FullName -Raw -ErrorAction SilentlyContinue).Length

    if ($charCount -gt $maxChars) {
        $violations += [PSCustomObject]@{
            Path      = $file.FullName
            CharCount = $charCount
        }
    }
}

if ($violations.Count -gt 0) {
    foreach ($v in $violations) {
        Write-Host "MUST be split into parts: '$($v.Path)' has $($v.CharCount) characters (limit: $maxChars)." -ForegroundColor Red
    }
    exit 2
}

Write-Host "All files in '$srcPath' are within the $maxChars character limit."
exit 0