# Tuff Testing Guide

## Overview

The Tuff compiler includes an automated test runner that compiles and executes all test files across both JavaScript and C++ targets.

## Running Tests

### Run All Tests

```powershell
.\run_tests.ps1
```

### Run with Verbose Output

```powershell
.\run_tests.ps1 -Verbose
```

### Run Specific Feature Tests

```powershell
.\run_tests.ps1 -Feature feature7_generics
```

### Run Specific Target Only

```powershell
# JavaScript only
.\run_tests.ps1 -Target js

# C++ only
.\run_tests.ps1 -Target cpp
```

## Test Structure

Tests are organized in `bootstrap/tests/` by feature:

```
bootstrap/tests/
├── feature1_variables/
│   ├── test_simple.tuff
│   ├── test_mutable.tuff
│   └── ...
├── feature2_operators/
│   ├── test_arithmetic.tuff
│   └── ...
└── feature7_generics/
    ├── test_generic_function.tuff
    └── ...
```

## Test Configuration

The file `bootstrap/tests/test_config.json` contains:

- **expected_exit_codes**: Maps test names to expected exit codes
- **skip_tests**: List of tests to skip

### Example Configuration

```json
{
  "expected_exit_codes": {
    "feature1_variables/test_simple": 10,
    "feature7_generics/test_generic_function": 10
  },
  "skip_tests": []
}
```

## Writing Tests

Each test file (`.tuff`) should:

1. Be self-contained
2. Use `process.exit()` in the generated JS or `return` from `main()` in C++ to set the exit code
3. Return a specific exit code to signal success

### Example Test

```tuff
fn test_main(): I32 => {
    let x: I32 = 10;
    return x;
}

test_main();
```

This test should exit with code 10.

## Test Validation

The test runner validates:

1. **Compilation**: Both JS and C++ targets must compile successfully
2. **Execution**: Both targets must execute without crashing
3. **Exit Codes**:
   - If an expected exit code is configured, both targets must match it
   - If no expected exit code is configured, both targets must produce the same exit code

## CI Integration

To integrate with CI/CD:

```powershell
# Build compiler
cd bootstrap\build
cmake --build . --config Release
cd ..\..

# Run tests
.\run_tests.ps1

# Check exit code
if ($LASTEXITCODE -ne 0) {
    Write-Error "Tests failed"
    exit 1
}
```

## Troubleshooting

### Node.js Not Found

Install Node.js from https://nodejs.org/

### clang Not Found

Install LLVM/clang from https://releases.llvm.org/

### Compiler Not Found

Build the compiler first:

```powershell
cd bootstrap\build
cmake --build . --config Release
```

## Test Results

The test runner outputs:

- **✓**: Test passed
- **✗**: Test failed (exit code mismatch)
- **⚠**: Test error (compilation or execution failure)

### Summary Report

After all tests run, you'll see a summary:

```
═══════════════════════════════════════════════════════════════════
TEST SUMMARY
═══════════════════════════════════════════════════════════════════

✓ feature1_variables: 3/3 passed
✓ feature7_generics: 3/3 passed

═══════════════════════════════════════════════════════════════════
TOTAL: 6/6 passed, 0 failed, 0 errors
═══════════════════════════════════════════════════════════════════
```
