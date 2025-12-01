# Tuff Programming Language

A statically-typed, multi-platform programming language that compiles to JavaScript and C++. Tuff features ownership and borrow checking, generics, and a modern module system inspired by Rust and Kotlin Multiplatform.

## Features

✅ **Complete Language Features**:

- Variables with immutability by default and type inference
- All primitive types (I8-I64, U8-U64, F32, F64, Bool, Void, USize)
- Comprehensive operators (arithmetic, comparison, logical, bitwise, type operators)
- Control flow (if/else expressions, while, loop, break, continue)
- Structs with nesting and mutation
- Functions with recursion and forward references
- Enums with variant access and equality
- Generics for functions and structs (monomorphization)
- Multi-platform support via `expect`/`actual` pattern
- Modules and namespaces with fully qualified names
- Pointers (mutable and immutable) with references and dereferencing
- Arrays with literals and indexing
- **Ownership and borrow checking** (move semantics, lifetime tracking)
- Union types with `is` operator for type checking
- Intersection types with `&` operator for struct merging
- Type aliases for complex types
- `sizeOf` operator for compile-time type size queries
- External function declarations for C/C++ interop

## Quick Start

### Example Program

```tuff
// Define a generic struct
struct Point<T> {
    x: T,
    y: T
}

// Generic function with type inference
fn distance<T>(p1: Point<T>, p2: Point<T>): F64 => {
    let dx = p1.x - p2.x;
    let dy = p1.y - p2.y;
    sqrt((dx * dx) + (dy * dy))
}
Documentation

- **[Tutorial](docs/TUTORIAL.md)**: Comprehensive guide to all language features
- **[Language Specification](docs/LANGUAGE.md)**: Complete formal specification
- **Test Suite**: See `src/commonTest/tuff/` for extensive feature examples

## Compilation Targets

- **JavaScript**: Full ES6+ with Node.js support
- **C++**: Modern C++17 with no external dependencies

The compiler uses monomorphization for generics (C++ templates for native, specialized JS functions) and enforces memory safety through compile-time ownership analysis
## Project Structure

This project follows a **Kotlin Multiplatform-inspired** structure with common code and platform-specific implementations:

```

tuff/
├── src/
│ ├── commonMain/tuff/ # Common code (expect declarations)
│ │ ├── io.tuff # I/O interface
│ │ ├── main.tuff # Entry point
│ │ └── string.tuff # String operations
│ ├── jsMain/tuff/ # JavaScript implementations (actual)
│ │ ├── io.tuff
│ │ └── string.tuff
│ ├── cppMain/tuff/ # C++ implementations (actual)
│ │ ├── io.tuff
│ │ └── string.tuff
│ └── commonTest/tuff/ # Shared tests
│ ├── feature1_variables/
│ ├── feature2_operators/
│ └── ...
├── bootstrap/ # Stage 0 compiler (C++17)
│ ├── src/ # Compiler source code
│ └── build/ # Build output
├── dist/ # Compiled output (gitignored)
│ ├── js/tuff/ # JavaScript compiled files
│ └── native/tuff/ # C++ compiled files
├── examples/ # Example programs
├── docs/ # Documentation
└── build/ # Build artifacts (gitignored)

````

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
````

### Build the Project

Compile all source files from `src/` to both JavaScript and C++ targets with package structure preserved:

```powershell
# Build all targets (JS + C++)
.\build.ps1

# Build specific target
.\build.ps1 -Target js
.\build.ps1 -Target cpp

# Clean and rebuild
.\build.ps1 -Clean
```

Output will be in:

- **JavaScript**: `dist/js/tuff/`
- **C++**: `dist/native/tuff/`

The build system:

- Discovers all `.tuff` files in `src/commonMain/tuff/`
- Merges with platform-specific files from `src/jsMain/tuff/` or `src/cppMain/tuff/`
- Combines `expect` (interface) and `actual` (implementation) declarations
- Preserves package structure in output

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
node ++ -std=c++17 output.cpp -o program
.\program.exe
```

## Key Language Features

### Ownership and Borrow Checking

Tuff enforces memory safety at compile-time with Rust-style ownership rules:

```tuff
struct Data { value: I32 }

let d = Data { 42 };
let e = d;           // d is moved to e
// d.value;          // ERROR: use of moved value

let mut x: I32 = 10;
let p: *mut I32 = &mut x;  // Mutable borrow
*p = 20;             // Modify through pointer
```

### Union and Intersection Types

```tuff
// Union: value can be multiple types
let x: I32 | Bool = 42;
if (x is I32) {
    // x is I32 here
}

// Intersection: merge struct values
struct Point { x: I32, y: I32 }
struct Color { r: I32, g: I32, b: I32 }
let merged = point & color;  // Has x, y, r, g, b fields
```

### Multi-Platform Development

```tuff
// Interface (expect)
expect fn io::println(message: String): Void;

// JavaScript implementation (actual)
actual fn io::println(message: String): Void => {
    // JS-specific code
}

// C++ implementation (actual)
actual fn io::println(message: String): Void => {
    // C++-specific code
}
```

## Architecture

The bootstrap compiler (Stage 0) is written in C++17 and follows a strict pipeline:

1. **Lexer**: Tokenizes source code
2. **Parser**: Produces an Abstract Syntax Tree (AST)
3. **Type Checker**: Two-pass type checking with ownership analysis
   - Pass 1: Register declarations (handles forward references)
   - Pass 2: Validate types, resolve symbols, enforce ownership rules
4. **Code Generator**: Emits target-specific code (JS or C++)

The compiler is designed to be self-hosting, with the ultimate goal of rewriting it in Tuff itself.

## Contributing

This project follows strict architectural principles:

- **Fail-fast error handling**: Compilation errors exit immediately
- **Zero runtime overhead**: Ownership checking is compile-time only
- **Multi-file class organization**: Large classes split across multiple `.cpp` files
- **Comprehensive testing**: All features have dedicated test suites

See [.github/copilot-instructions.md](.github/copilot-instructions.md) for detailed development guidelines.

## License

[Specify license here]ompile to C++
.\bootstrap\build\Release\tuffc.exe yourprogram.tuff cpp > output.cpp
clang output.cpp -o program
.\program.exe

```

```
