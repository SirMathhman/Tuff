# Tuff Compiler Development Instructions

You are assisting with the development of the **Tuff** programming language compiler. Tuff is a statically-typed, self-hosting language targeting JavaScript and C++.

## Project Structure

- **bootstrap/**: The Stage 0 compiler written in C++ (C++17).
  - **src/**: Compiler source code.
    - `lexer.cpp`, `parser.cpp`: Frontend.
    - `type_checker.cpp`: Semantic analysis.
    - `codegen_js.cpp`, `codegen_cpp.cpp`: Backend code generation.
    - `include/`: Header files (AST, tokens, etc.).
  - **tests/**: Integration tests organized by feature (e.g., `feature1_variables`).
- **core/**: Common language definitions and standard library interfaces.
- **js/**: JavaScript target implementation.
- **cpp/**: C++ target implementation.

## Architecture

The compiler follows a standard pipeline:

1.  **Lexer** (`Lexer`): Converts source into tokens.
2.  **Parser** (`Parser`): Builds an Abstract Syntax Tree (AST) from tokens.
3.  **Type Checker** (`TypeChecker`): Validates types, resolves symbols, and handles `expect`/`actual` logic.
4.  **Code Generator** (`CodeGeneratorJS` / `CodeGeneratorCPP`): Emits target code.

### Key Concepts

- **Multi-Platform**: Tuff uses `expect` (interface) and `actual` (implementation) keywords to handle platform-specific logic.
- **Monomorphization**: Generics are compiled by generating specialized versions for each type argument (like C++ templates).

## Development Workflow

### Building the Compiler (Bootstrap)

The bootstrap compiler is built using CMake.

```bash
cd bootstrap
mkdir build
cd build
cmake ..
cmake --build .
```

### Running the Compiler

Run the compiled executable (`tuffc`) with the source file and target ("js" or "cpp").

```bash
# Windows (PowerShell)
.\bootstrap\build\Debug\tuffc.exe path\to\source.tuff js

# Linux/macOS
./bootstrap/build/tuffc path/to/source.tuff js
```

### Testing

Integration tests are located in `bootstrap/tests/`.

- **Input**: `.tuff` files.
- **Expected Output**: Corresponding `.js` or `.cpp` files (if present) or manual verification.
- Currently, tests are run manually by invoking the compiler on these files.

## Coding Conventions

### C++ (Compiler)

- Use **C++17** standards.
- Prefer `std::shared_ptr` for AST nodes.
- Error handling: Print to `std::cerr` and exit (current simple approach).

### Tuff (Language)

- **Types**: `I32`, `F64`, `Bool`, `String`, `Void`.
- **Variables**: `let x: I32 = 10;` (immutable by default).
- **Functions**: `fn name(arg: Type): RetType => body;`
- **Pointers**: `*T` (pointer), `&val` (reference), `*ptr` (dereference).

## Key Files

- `bootstrap/src/include/ast.h`: AST node definitions.
- `bootstrap/src/type_checker.cpp`: Core type checking logic.
- `docs/LANGUAGE.md`: Language specification and feature status.
