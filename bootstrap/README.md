# Tuff Bootstrap Compiler (Stage 0)

This is the initial bootstrap compiler for Tuff, written in C++. It implements a minimal compiler that can parse Tuff source code and generate JavaScript or C++ output.

## Building

```bash
mkdir build
cd build
cmake ..
cmake --build .
```

## Running

```bash
./tuffc ../build.json
```

## Architecture

- **Lexer**: Tokenizes Tuff source code
- **Parser**: Builds an Abstract Syntax Tree (AST)
- **TypeChecker**: Validates types and resolves expect/actual pairs
- **CodeGenerator**: Emits JavaScript or C++ code

## Current Status

All components are currently stubbed. Implementation in progress.
