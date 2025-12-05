# Tuff Programming Language

A hybrid systems programming language combining the best features of Rust, TypeScript, and Kotlin.

## Overview

Tuff is designed to be:
- **Safe by default**: Ownership-based memory management without garbage collection
- **Expressive**: Powerful type system with union types and pattern matching
- **Practical**: Multi-platform compilation targeting multiple backends
- **Ergonomic**: Swift-like syntax with modern language features

## Current Status

**Version 0.1.0 - MVP (Tree-Walking Interpreter)**

The initial implementation provides a functional interpreter with:
- Lexer with full token support (keywords, operators, literals, delimiters)
- Recursive descent parser producing an Abstract Syntax Tree
- Tree-walking evaluator with:
  - Arithmetic and logical operations
  - Variable declarations and assignments
  - Function definitions with lexical scoping and closures
  - Control flow: if/else, while loops, for..in loops
  - Array and string indexing
  - Ternary conditional expressions
  - Comments (// style)

## Getting Started

### Build
```bash
cargo build --release
```

### Run the REPL
```bash
cargo run --release
```

### Run Tests
```bash
cargo test
```

## Language Features

### Variables and Functions
```tuff
let x = 42;
let msg = "Hello, Tuff!";

fn add(a, b) {
    a + b;
}

add(10, 20);  // Returns 30
```

### Control Flow
```tuff
if (x > 10) {
    x = x * 2;
} else {
    x = 0;
}

while (x > 0) {
    x = x - 1;
}

for i in [1, 2, 3] {
    // i takes each value
}
```

### Arrays
```tuff
let arr = [1, 2, 3, 4, 5];
arr[0];      // 1
arr[2];      // 3
```

### String Operations
```tuff
let greeting = "Hello" + " " + "World";
greeting[0];  // "H"
```

## Architecture

```
src/
├── lexer.rs      - Tokenization
├── parser.rs     - Syntax analysis (tokens → AST)
├── ast.rs        - Abstract Syntax Tree definitions
├── value.rs      - Runtime values and evaluation
├── main.rs       - REPL entry point
└── lib.rs        - Library exports
```

## Roadmap

### Phase 1: Foundation (Current ✓)
- [x] Lexer
- [x] Parser
- [x] Tree-walking interpreter
- [x] REPL

### Phase 2: Type System & Semantics
- [ ] Static type checking
- [ ] Generics
- [ ] Traits/interfaces
- [ ] Pattern matching

### Phase 3: Standard Library
- [ ] Collections (Vec, HashMap, etc.)
- [ ] I/O operations
- [ ] File system API
- [ ] String utilities

### Phase 4: Optimization
- [ ] Bytecode compiler
- [ ] Bytecode VM
- [ ] Optimization passes
- [ ] Performance profiling

### Phase 5: Ecosystem
- [ ] Package manager
- [ ] Build system
- [ ] IDE/Editor support
- [ ] Community libraries

## Implementation Notes

- The interpreter uses a tree-walking approach for rapid prototyping
- Function closures capture their defining environment
- Scoping is lexically based with dynamic lookup
- No garbage collector: values are reference-counted
- All numbers are stored as f64 (like JavaScript)

## Future Enhancements

- [ ] Ownership and borrowing semantics
- [ ] Null safety with `?` operator
- [ ] Error handling with `Result<T, E>`
- [ ] Async/await with coroutines
- [ ] LLVM backend for compilation
- [ ] Cross-platform support
