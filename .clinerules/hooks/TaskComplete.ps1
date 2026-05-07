# TaskComplete Hook
# Enforces that `npm run test` and `npm run cpd` pass before allowing task completion.
$failed = $false
$output = ""

# Run npm run test
$testResult = & npm run test 2>&1 | Out-String
if ($LASTEXITCODE -ne 0) {
    $failed = $true
    $output += "=== npm run test FAILED ===`n$testResult`n"
}

# Run npm run cpd
$cpdResult = & npm run cpd 2>&1 | Out-String
if ($LASTEXITCODE -ne 0) {
    $failed = $true
    $output += "=== npm run cpd FAILED ===`n$cpdResult`n"
}

if ($failed) {
    # Write to stderr so Cline captures it as context
    [Console]::Error.WriteLine($output)

    @{
        cancel              = $true
        contextModification = ""
        errorMessage        = $output
    } | ConvertTo-Json -Compress
}
else {
    @{
        cancel              = $false
        contextModification = ""
        errorMessage        = ""
    } | ConvertTo-Json -Compress
}
