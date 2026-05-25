param()

$ProjectRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))

# Redirect ALL normal output to stderr so it surfaces to the agent
function Write-OutputToStderr {
    $input | ForEach-Object { $host.ui.WriteErrorLine($_) }
}

$BuildDir = Join-Path $ProjectRoot "build"

Write-OutputToStderr "Running tests..."
Write-OutputToStderr ""

# Build (capture stdout+stderr via PowerShell stream redirection)
$buildOutput = & "cmake" "--build" $BuildDir 2>&1
$buildText = $buildOutput | Out-String
if ($LASTEXITCODE -ne 0) {
    $buildText | Write-OutputToStderr
    $host.ui.WriteErrorLine("FAILED: Build failed.")
    '{ "hookSpecificOutput": { "stopReason": "Tests failed - build error" } }'
    exit 2
}
$buildText | Write-OutputToStderr

# Run tests via CTest
$testOutput = & "ctest" "--test-dir" $BuildDir "--output-on-failure" 2>&1
$testText = $testOutput | Out-String

if ($LASTEXITCODE -ne 0) {
    $testText | Write-OutputToStderr
    $host.ui.WriteErrorLine("FAILED: One or more tests failed.")
    '{ "hookSpecificOutput": { "stopReason": "Tests failed - test errors" } }'
    exit 2
}

$testText | Write-OutputToStderr
$host.ui.WriteErrorLine("PASSED: All tests passed.")

# Signal continue on stdout
'{ "hookSpecificOutput": { "continue": true } }'