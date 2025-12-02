# Tuff Compiler Development Instructions

You are assisting with the development of the **Tuff** programming language compiler. Tuff is a statically-typed, self-hosting language targeting JavaScript and C++.

## Required Reading

**MANDATORY**: Before assisting with any Tuff language work, you MUST read `docs/TUTORIAL.md`. This tutorial provides a comprehensive overview of all implemented Tuff language features including:

- Variables, types, and operators
- Functions and control flow
- Data structures (structs, enums, arrays)
- Pointers, ownership, and borrow checking
- Union and intersection types
- Modules and the expect/actual pattern
- Advanced features (sizeOf, extern, etc.)

Refer to `docs/LANGUAGE.md` for the complete language specification.

## Project Overview

- **bootstrap/**: The Stage 0 compiler (C++17).
- **src/tuff/**: Standard library implementation (`.tuff` files and C++ headers).
- **test/tuff/**: Integration tests (`.tuff` files).
- **docs/**: Language documentation.

## Architecture

The compiler follows a strict pipeline:

1.  **Lexer** (`src/lexer.cpp`): Tokenizes source code.
2.  **Parser** (`src/parser.cpp` + `src/parser/*.cpp`): Produces an AST (`ASTNode`).
    - **Split Implementation**: The `Parser` class is large, so methods are distributed across `parser_statements.cpp`, `parser_expressions.cpp`, etc.
3.  **Type Checker** (`src/type_checker.cpp` + `src/type_checker/*.cpp`):
    - **Pass 1**: Registers declarations (structs, functions, enums).
    - **Pass 2**: Validates types, resolves symbols, and enforces mutability.
    - **Symbol Table**: Maps names to `{type, isMutable}`.
4.  **Code Generator** (`src/codegen/codegen_cpp.cpp` + `src/codegen/*.cpp`): Emits target code to `stdout` or file.

### Key Concepts

- **AST**: Nodes use `std::shared_ptr<ASTNode>`. See `bootstrap/src/include/ast.h`.
- **Split Implementation**: Large classes (`Parser`, `TypeChecker`, `CodeGeneratorCPP`) have their implementation distributed across multiple `.cpp` files. Always check the specific subdirectory (e.g., `src/parser/`) for the relevant implementation file.
- **Error Handling**: Fail-fast using `std::cerr` and `exit(1)`.
- **Multi-Platform**: `expect` (interface) and `actual` (implementation) keywords.
- **Monomorphization**: Generics are specialized at compile time.

## Development Workflow

### 1. Build (Bootstrap)

Use CMake to build the compiler.

```powershell
cd bootstrap/build
cmake --build . --config Release
```

### 2. Test

Use the PowerShell test runner `run_tests.ps1`. **Always run tests after changes.**

```powershell
# Run all tests (auto-parallel)
.\run_tests.ps1

# Run specific feature (filters by directory name in test/tuff/)
.\run_tests.ps1 -Feature feature1_variables

# Run sequentially (for debugging)
.\run_tests.ps1 -Parallel 1
```

_Note: Tests compile `.tuff` files to C++, compile the C++ to an executable using `clang++`, and execute them._

### 3. Run Manually

```powershell
# Compile Tuff to C++
.\bootstrap\build\Release\tuffc.exe --sources path/to/source.tuff --target cpp > output.cpp

# Compile Tuff to JavaScript
.\bootstrap\build\Release\tuffc.exe --sources path/to/source.tuff --target js > output.js
```

## Coding Conventions

### C++ (Compiler)

- **Standard**: C++17.
- **Memory**: Use `std::shared_ptr` for AST nodes.
- **Strings**: `std::string` for identifiers and values.
- **Formatting**: 2-space indentation.
- **Headers**: `bootstrap/src/include/*.h` are the source of truth for class interfaces.
- **Implementation**: When adding a new feature, likely need to touch `ast.h`, `parser_*.cpp`, `type_checker_*.cpp`, and `codegen_*.cpp`.

### Tuff (Language)

**Read [docs/TUTORIAL.md](../docs/TUTORIAL.md) for comprehensive language syntax and examples.**

- **Types**: `I32`, `I64`, `U32`, `U64`, `F32`, `F64`, `Bool`, `String`, `Void`, `USize`.
- **Variables**: `let x: I32 = 10;` (immutable). `let mut x = 10;` (mutable).
- **Functions**: `fn name(arg: Type): RetType => body;`
- **Structs**: `struct Point { x: I32, y: I32 }`
- **Pointers**: `*T` (immutable), `*mut T` (mutable), `&x` (reference), `*p` (dereference).
- **Arrays**: `[Type; Initialized; Capacity]`
- **Unions**: `I32 | Bool` with `is` operator
- **Intersections**: `struct1 & struct2` to merge values
- **Modules**: `module name { ... }` and `use path::to::module`

## Key Files

- [docs/TUTORIAL.md](../docs/TUTORIAL.md): **MANDATORY reading** - comprehensive language tutorial.
- [docs/LANGUAGE.md](../docs/LANGUAGE.md): Complete language specification.
- `bootstrap/src/include/ast.h`: AST node definitions.
- `bootstrap/src/include/parser.h`: Parser class definition.
- `bootstrap/src/include/type_checker.h`: TypeChecker class definition.
- `bootstrap/src/parser/*.cpp`: Parser implementation files.
- `bootstrap/src/type_checker/*.cpp`: Type checker logic.
- `bootstrap/src/codegen/*.cpp`: Code generation logic.
- `run_tests.ps1`: Test runner script.
