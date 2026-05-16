npm run test; 
if ($LASTEXITCODE -ne 0) { exit 1 }
Write-Host "All tests passed.";

npm run lint;
if ($LASTEXITCODE -ne 0) { 
    Write-Error "Linting failed. 
    Do note that ESLint rules will ignore comments and whitespace.
    If the file is too long, you should split the file.";
    exit 1 
}
Write-Host "Linting passed.";

npm run cpd;
if ($LASTEXITCODE -ne 0) { exit 1 }
Write-Host "Copy-paste detection passed.";

npm run check-dupes;
if ($LASTEXITCODE -ne 0) {
    Write-Error "Duplicate expression check failed.
    The expression(s) listed above appear more than once.
    Consider extracting them into a shared variable.";
    exit 1
}
Write-Host "Duplicate expression check passed.";

npm run check-string-dupes;
if ($LASTEXITCODE -ne 0) {
    Write-Error "Duplicate substring check failed.
    The substring(s) listed above appear more than once.
    Consider extracting them into a shared variable.";
    exit 1
}
Write-Host "Duplicate substring check passed.";