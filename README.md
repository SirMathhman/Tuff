# SafeC Compiler

SafeC is a superset of C that adds type parameters (generics) to structs and functions. The compiler translates SafeC code to standard C through monomorphization - generating specialized versions of generic types and functions for each concrete type used.

## Features

- **Generic Structs**: Define structs with type parameters

  ```c
  struct Wrapper<T> {
      T value;
  };

  struct Pair<K, V> {
      K key;
      V value;
  };
  ```

- **Generic Functions**: Define functions with type parameters

  ```c
  T identity<T>(T x) {
      return x;
  }

  void swap<T>(T* a, T* b) {
      T temp = *a;
      *a = *b;
      *b = temp;
  }
  ```

- **All C Features Preserved**: Standard C code compiles unchanged

## Building

### Prerequisites

- Clang or GCC compiler
- PowerShell (on Windows)

### Build Commands

```powershell
# Build the compiler
.\build.ps1

# Run all tests
.\build.ps1 -Test

# Build and run individual test suites
.\build.ps1 -TestLexer
.\build.ps1 -TestParser
.\build.ps1 -TestCodegen

# Clean build artifacts
.\build.ps1 -Clean
```

## Usage

```powershell
# Compile SafeC to C (output to stdout)
.\build\safec.exe input.safec

# Compile SafeC to C file
.\build\safec.exe input.safec -o output.c

# Also generate a header file (output.h)
.\build\safec.exe input.safec -o output.c --header

# Show tokens (debugging)
.\build\safec.exe --tokens input.safec

# Show AST (debugging)
.\build\safec.exe --ast input.safec
```

### Include Directive

SafeC supports includes without the `.h` extension. The compiler will automatically append `.h`:

```c
#include "lexer"     // Generates: #include "lexer.h"
#include <stdio.h>   // System includes work as normal
```

## Example

**Input (example.safec):**

```c
struct Wrapper<T> {
    T value;
};

T identity<T>(T x) {
    return x;
}

void swap<T>(T* a, T* b) {
    T temp = *a;
    *a = *b;
    *b = temp;
}

int main() {
    Wrapper<int> w;
    w.value = 42;

    int x = identity<int>(10);

    int a = 1, b = 2;
    swap<int>(&a, &b);

    return 0;
}
```

**Output (generated C):**

```c
struct Wrapper_int {
    int value;
};

int identity_int(int x) {
    return x;
}

void swap_int(int* a, int* b) {
    int temp = *a;
    *a = *b;
    *b = temp;
}

int main() {
    Wrapper_int w;
    w.value = 42;

    int x = identity_int(10);

    int a = 1, b = 2;
    swap_int(&a, &b);

    return 0;
}
```

## How It Works

1. **Lexing**: Tokenizes the input source code
2. **Parsing**: Builds an Abstract Syntax Tree (AST)
3. **Code Generation**:
   - Collects all generic type/function usages
   - Generates monomorphized (specialized) versions
   - Outputs valid C code

## Project Structure

```
├── src/
│   ├── lexer.c     # Tokenizer
│   ├── lexer.h
│   ├── ast.c       # AST node types and utilities
│   ├── ast.h
│   ├── parser.c    # Recursive descent parser
│   ├── parser.h
│   ├── codegen.c   # C code generator with monomorphization
│   ├── codegen.h
│   └── main.c      # CLI driver
├── safec-src/      # Self-hosting SafeC source files
│   └── lexer.safec
├── tests/
│   ├── test_lexer.c
│   ├── test_parser.c
│   └── test_codegen.c
├── examples/
│   └── generic.safec
├── build.ps1       # Build script
└── README.md
```

## Self-Hosting

SafeC is designed to eventually compile itself. The `safec-src/` directory contains SafeC source files that will replace the C implementation:

```powershell
# Compile lexer.safec to C
.\build\safec.exe safec-src\lexer.safec -o build\gen\lexer.c --header
```

## Roadmap

Future features to consider:

- Type inference for generic function calls
- Constraints on type parameters
- Generic type aliases
- Default type parameters

## License

MIT License
