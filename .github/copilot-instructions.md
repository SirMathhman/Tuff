# Tuff Compiler Development Instructions

You are assisting with the development of the **Tuff** programming language compiler. Tuff is a statically-typed, self-hosting language targeting JavaScript and C++.

## Project Overview

- **bootstrap/**: The Stage 0 compiler (C++17).
- **core/**: Standard library interfaces (`expect` declarations).
- **js/**: JavaScript target implementation (`actual` definitions).
- **cpp/**: C++ target implementation (`actual` definitions).

## Architecture

The compiler follows a strict pipeline:

1.  **Lexer** (`Lexer`): Tokenizes source code.
2.  **Parser** (`Parser`): Produces an AST (`ASTNode`). Implementation is split across multiple `parser_*.cpp` files.
3.  **Type Checker** (`TypeChecker`):
    - **Pass 1**: Registers declarations (structs, functions, enums) to handle forward references.
    - **Pass 2**: Validates types, resolves symbols, and enforces mutability.
    - **Symbol Table**: Maps names to `{type, isMutable}`.
    - Implementation is split across `type_checker.cpp` and `type_checker/` directory.
4.  **Code Generator** (`CodeGeneratorJS` / `CodeGeneratorCPP`): Emits target code to `stdout`. Implementation split across `codegen_*.cpp` and `codegen/` directory.

### Key Concepts

- **AST**: Nodes use `std::shared_ptr<ASTNode>`. See `bootstrap/src/include/ast.h`.
- **Class Implementation Split**: Large classes (`Parser`, `TypeChecker`) have their implementation distributed across multiple `.cpp` files (e.g., `parser_statements.cpp`, `parser_expressions.cpp`).
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

Use the PowerShell test runner. **Always run tests after changes.**

```powershell
# Run all tests
.\run_tests.ps1

# Run specific feature
.\run_tests.ps1 -Feature feature1_variables

# Run specific target
.\run_tests.ps1 -Target js
```

_Note: Tests compile `.tuff` files to JS/C++ and execute them, comparing exit codes._

### 3. Run Manually

```powershell
.\bootstrap\build\Release\tuffc.exe path/to/source.tuff js > output.js
```

## Coding Conventions

### C++ (Compiler)

- **Standard**: C++17.
- **Memory**: Use `std::shared_ptr` for AST nodes.
- **Strings**: `std::string` for identifiers and values.
- **Formatting**: 2-space indentation.
- **Headers**: `bootstrap/src/include/*.h` are the source of truth for class interfaces.

### Tuff (Language)

- **Types**: `I32`, `F64`, `Bool`, `String`, `Void`.
- **Variables**: `let x: I32 = 10;` (immutable). `let mut x = 10;` (mutable).
- **Functions**: `fn name(arg: Type): RetType => body;`
- **Structs**: `struct Point { x: I32, y: I32 }`

## Key Files

- `bootstrap/src/include/ast.h`: AST node definitions.
- `bootstrap/src/include/parser.h`: Parser class definition.
- `bootstrap/src/include/type_checker.h`: TypeChecker class definition.
- `bootstrap/src/parser*.cpp`: Parser implementation files.
- `bootstrap/src/type_checker.cpp` & `bootstrap/src/type_checker/*.cpp`: Type checker logic.
- `run_tests.ps1`: Test runner script.
