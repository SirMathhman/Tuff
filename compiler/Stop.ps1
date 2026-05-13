npm run test; 
if ($LASTEXITCODE -ne 0) { exit 1 }
Write-Host "All tests passed.";

npm run lint;
if ($LASTEXITCODE -ne 0) { 
    Write-Error "Linting failed. Do note that ESLint rules will ignore comments and whitespace.";
    exit 1 
}
Write-Host "Linting passed.";

npm run cpd;
if ($LASTEXITCODE -ne 0) { exit 1 }
Write-Host "Copy-paste detection passed.";