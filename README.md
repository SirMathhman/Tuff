# Tuff Compiler

A self-hosting compiler for the **Tuff** programming language, targeting JavaScript and C++.

## Project Structure

This project follows a **Kotlin Multiplatform-inspired** structure with common code and platform-specific implementations:

```
tuff/
├── src/
│   ├── commonMain/tuff/      # Common code (expect declarations)
│   │   ├── io.tuff           # I/O interface
│   │   ├── main.tuff         # Entry point
│   │   └── string.tuff       # String operations
│   ├── jsMain/tuff/          # JavaScript implementations (actual)
│   │   ├── io.tuff
│   │   └── string.tuff
│   ├── cppMain/tuff/         # C++ implementations (actual)
│   │   ├── io.tuff
│   │   └── string.tuff
│   └── commonTest/tuff/      # Shared tests
│       ├── feature1_variables/
│       ├── feature2_operators/
│       └── ...
├── bootstrap/                # Stage 0 compiler (C++17)
│   ├── src/                  # Compiler source code
│   └── build/                # Build output
├── examples/                 # Example programs
├── docs/                     # Documentation
└── build/                    # Build artifacts (gitignored)
```

### Source Sets

- **commonMain**: Platform-independent code with `expect` declarations
- **jsMain**: JavaScript target with `actual` implementations
- **cppMain**: C++ target with `actual` implementations  
- **commonTest**: Cross-platform tests

## Language Features

- **Static Typing**: Strong type system with inference.
- **Generics**: C++ template-style generics (monomorphization).
- **Multi-Platform**: Native support for `expect`/`actual` pattern to handle platform differences.
- **Targets**:
  - JavaScript (Node.js/Browser)
  - C++ (Native performance, no LLVM dependency for now)

## Building

### Prerequisites
- CMake 3.15+
- C++17 compiler (MSVC, GCC, or Clang)
- Node.js (for running JS target)

### Build the Bootstrap Compiler

```powershell
cd bootstrap/build
cmake --build . --config Release
```

### Run Tests

```powershell
# Run all tests
.\run_tests.ps1

# Run specific feature tests
.\run_tests.ps1 -Feature feature7_generics

# Run with verbose output
.\run_tests.ps1 -Verbose

# Run only JS or C++ target
.\run_tests.ps1 -Target js
.\run_tests.ps1 -Target cpp
```

### Compile Tuff Programs

```powershell
# Compile to JavaScript
.\bootstrap\build\Release\tuffc.exe yourprogram.tuff js > output.js
node output.js

# Compile to C++
.\bootstrap\build\Release\tuffc.exe yourprogram.tuff cpp > output.cpp
clang output.cpp -o program
.\program.exe
```
