npm run test; 
if ($LASTEXITCODE -ne 0) { exit 1 }
Write-Host "All tests passed.";

npm run lint;
if ($LASTEXITCODE -ne 0) { exit 1 }
Write-Host "Linting passed.";

npm run cpd;
if ($LASTEXITCODE -ne 0) { exit 1 }
Write-Host "Copy-paste detection passed.";