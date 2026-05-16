$output = npm run test 2>&1;
if ($LASTEXITCODE -ne 0) { $output; exit 1 }
Write-Host "All tests passed.";

$output = npm run lint 2>&1;
if ($LASTEXITCODE -ne 0) {
    $output;
    Write-Error "Linting failed. 
    Do note that ESLint rules will ignore comments and whitespace.
    If the file is too long, you should split the file.";
    exit 1
}
Write-Host "Linting passed.";

$output = npm run cpd 2>&1;
if ($LASTEXITCODE -ne 0) { $output; exit 1 }
Write-Host "Copy-paste detection passed.";

$output = npm run check-dupes 2>&1;
if ($LASTEXITCODE -ne 0) {
    $output;
    Write-Error "Duplicate expression check failed.
    The expression(s) listed above appear more than once.
    Consider extracting them into a shared variable.";
    exit 1
}
Write-Host "Duplicate expression check passed.";

$output = npm run check-string-dupes 2>&1;
if ($LASTEXITCODE -ne 0) {
    $output;
    Write-Error "Duplicate substring check failed.
    The substring(s) listed above appear more than once.
    Consider extracting them into a shared variable.";
    exit 1
}
Write-Host "Duplicate substring check passed.";