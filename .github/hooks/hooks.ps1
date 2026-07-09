$build = cargo build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to build"
    $build | Out-Host
    exit 2
}

$coverage = cargo +nightly llvm-cov --fail-under-lines 100 --show-missing-lines 2>&1 | Select-String -Pattern "panic|assertion|failed|Uncovered Lines|\.rs"

if ($LASTEXITCODE -ne 0) {
    Write-Host "Found test or coverage issues."
    $coverage| Out-Host
    exit 2
} else {
    Write-Host "No test or coverage issues found."
}

$duplication = pmd cpd --dir src --language rust --minimum-tokens 50 --ignore-literals --ignore-identifiers 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Found duplication."
    $duplication | Out-Host
    exit 2
} else {
    Write-Host "No duplication found."
}

$maxChars = 20000
$srcPath = Join-Path -Path $PWD -ChildPath "src"

if (-not (Test-Path -Path $srcPath)) {
    Write-Error "Path '$srcPath' does not exist."
    exit 2
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