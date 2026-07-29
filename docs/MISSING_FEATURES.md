# Missing Features

Features the Tuff interpreter does not yet have, organized by category.

## Core Language Features

### Control Flow

- [ ] `for` loop syntax (`for (let i = 0; i < 10; i += 1) { ... }`)
- [ ] `continue` statement (skip to next iteration)
- [ ] `return` statement (early return from functions — currently only expression-based `=> body`)
- [ ] `else if` as statement form (currently only expression form via chained `if`)
- [ ] `switch` statement (alternative to `match` with fall-through semantics)

### Type System

- [ ] `enum` type (named constants with optional associated data)
- [ ] `union` type (`A | B` — type can be one of several types)
- [ ] `type alias` (`type MyInt = I32`)
- [ ] `generic` types (`fn identity<T>(x : T) => x`)
- [ ] `trait` / `interface` (abstract type with method signatures)
- [ ] `impl` blocks (attach methods to existing types)
- [ ] `nullable` / `option` type (`T?` — value that may be absent)
- [ ] `string` type (text literals and operations)
- [ ] `char` type (single character literals)
- [ ] Type inference for function return types (currently requires explicit `: ReturnType` annotation)
- [ ] Variance checking (covariant/contravariant type parameters)

### Data Structures

- [ ] `HashMap` / `Dictionary` type (`{ key: value, ... }` with dynamic keys)
- [ ] `Tuple` type (`(I32, Bool)`)
- [ ] `String` literals and concatenation
- [ ] `Slice` type (`&[T; N]` — view into array without ownership)
- [ ] Dynamic arrays (resizeable, not fixed-length)
- [ ] Linked list / tree data structures

### Memory & Ownership

- [ ] `move` semantics (transfer ownership of values)
- [ ] `borrow` checker (prevent use-after-free, double-free)
- [ ] `drop` / destructor calls
- [ ] `Box<T>` (heap-allocated values)
- [ ] `Rc<T>` / `Arc<T>` (reference-counted pointers)
- [ ] Lifetime annotations (`&'a T`)
- [ ] Stack vs heap allocation model

## Operators & Expressions

### Binary Operators

- [ ] `%` (modulo)
- [ ] `**` (exponentiation)
- [ ] `<<` / `>>` (bitwise shift)
- [ ] `&` (bitwise AND — currently only reference)
- [ ] `|` (bitwise OR)
- [ ] `^` (bitwise XOR)
- [ ] `~` (bitwise NOT)
- [ ] `..` (range operator)
- [ ] `..=` (inclusive range)
- [ ] `??` (nullish coalescing)
- [ ] `..=` (range assignment)

### Unary Operators

- [ ] `!` (logical NOT — currently only `!` in `!=`)
- [ ] `++` / `--` (increment/decrement)
- [ ] `~` (bitwise NOT)

### Assignment Operators

- [ ] `*=` (multiply-assign)
- [ ] `/=` (divide-assign)
- [ ] `-=` (subtract-assign)
- [ ] `&=` / `|=` / `^=` (bitwise assign)
- [ ] `<<=` / `>>=` (shift assign)

### Other Expressions

- [ ] Ternary conditional (`cond ? a : b` — shorthand for `if`)
- [ ] Spread operator (`...arr` in function calls or arrays)
- [ ] Comma expression (`a, b, c` — evaluate all, return last)
- [ ] Lambda / closure syntax (`|x, y| => x + y`)
- [ ] Method call syntax (`obj.method()` — syntactic sugar for `method(obj)`)

## Functions & Modules

### Functions

- [ ] Closures (capture environment variables)
- [ ] Higher-order functions (functions as first-class values)
- [ ] Currying (`fn add(x) => fn(y) => x + y`)
- [ ] Default parameter values (`fn foo(x : I32 = 0) => x`)
- [ ] Variadic functions (`fn sum(...args : I32) => ...`)
- [ ] Named arguments (`foo(x: 1, y: 2)`)
- [ ] Recursion (currently may not work — no forward declaration)
- [ ] Tail call optimization
- [ ] `const` functions (compile-time evaluable)
- [ ] `inline` hint (suggest inlining)

### Modules & Imports

- [ ] `module` keyword (namespace declarations)
- [ ] `import` / `export` (cross-file dependencies)
- [ ] `use` (re-export / alias)
- [ ] `pub` / `private` visibility modifiers
- [ ] Module path resolution
- [ ] Circular dependency detection
- [ ] Conditional compilation (`#[cfg(feature)]`)

## Macros & Metaprogramming

- [ ] `macro` (compile-time code generation)
- [ ] `macro_rules!` (pattern-based macros)
- [ ] `derive` (automatic trait implementation)
- [ ] `const` generics (compile-time constants as type parameters)
- [ ] `assert` / `debug_assert` (compile-time and runtime assertions)
- [ ] `panic` / `unwrap` (error handling primitives)

## Error Handling

- [ ] `Result<T, E>` type (success/failure with error value)
- [ ] `try` operator (`?` — propagate errors)
- [ ] `catch` / `finally` blocks
- [ ] `throw` statement
- [ ] Custom error types
- [ ] Error chaining / stack traces

## Concurrency & Parallelism

- [ ] `async` / `await` (asynchronous operations)
- [ ] `spawn` (create new thread/task)
- [ ] `Channel` (message passing between threads)
- [ ] `Mutex` / `RwLock` (shared state synchronization)
- [ ] `Atomic` types (lock-free operations)
- [ ] `Future` / `Promise` type
- [ ] `select` statement (wait on multiple channels)

## I/O & System Integration

- [ ] `print` / `println` (output to console)
- [ ] `read` / `write` (file I/O)
- [ ] `stdin` / `stdout` / `stderr` access
- [ ] `env` (environment variables)
- [ ] `time` (timestamps, duration)
- [ ] `random` (random number generation)
- [ ] `math` library (sin, cos, sqrt, log, etc.)
- [ ] `format` (string formatting)
- [ ] `parse` (string to number conversion)

## Syntax & Usability

- [ ] Multi-line string literals (`"..."`)
- [ ] Raw string literals (`r#"..."#`)
- [ ] Template literals (interpolated strings)
- [ ] Comments (`//` single-line, `/* */` multi-line)
- [ ] Doc comments (`///` documentation)
- [ ] Shebang support (`#!/usr/bin/env tuff`)
- [ ] REPL / interactive mode
- [ ] Syntax highlighting definitions
- [ ] Language Server Protocol (LSP) support

## Tooling & Infrastructure

- [ ] Compiler (bytecode or native code generation)
- [ ] Standard library (`std/`)
- [ ] Package manager (dependency resolution)
- [ ] Build system (compilation pipeline)
- [ ] Formatter (automatic code formatting)
- [ ] Linter (static analysis rules)
- [ ] Documentation generator
- [ ] Test framework (beyond `bun:test` for the interpreter itself)
- [ ] Benchmark suite
- [ ] Fuzzing support
- [ ] WASM target
- [ ] CLI argument parsing

## Match Expression Enhancements

- [ ] Pattern matching on structs (`match x { case Point { x: 0 } => ... }`)
- [ ] Pattern matching on arrays (`match arr { case [first, ..rest] => ... }`)
- [ ] Guard clauses (`case x if x > 0 => ...`)
- [ ] Or patterns (`case 1 | 2 | 3 => ...`)
- [ ] Range patterns (`case 1..=10 => ...`)
- [ ] Destructuring in patterns (`match point { case Point { x, y } => x + y }`)
- [ ] Exhaustiveness checking (compiler warns on non-exhaustive matches)

## Struct Enhancements

- [ ] Struct methods (`struct Point { x, y } fn dist() => ...`)
- [ ] Struct inheritance / composition
- [ ] Default field values
- [ ] Struct destructuring (`let Point { x, y } = point`)
- [ ] Struct update syntax (`let p2 = { ...p, x: 10 }`)
- [ ] `sizeof` operator (size of type in bytes)
- [ ] `alignof` operator (alignment of type)

## Array Enhancements

- [ ] Array slicing (`arr[1..5]`)
- [ ] Array concatenation (`arr1 + arr2`)
- [ ] Array methods (`map`, `filter`, `reduce`, `forEach`)
- [ ] Array comprehensions (`[x * 2 for x in arr]`)
- [ ] `in` operator (`x in arr` — membership test)
- [ ] `len` property (`arr.len`)
- [ ] Multi-dimensional arrays (`arr[i][j][k]`)

## Visibility & Access Control

- [ ] `pub` / `private` field visibility on structs
- [ ] `pub` / `private` function visibility
- [ ] `pub` / `private` module visibility
- [ ] `protected` access (subclass-only)
- [ ] `internal` access (module-only)

## Numeric Types

- [ ] `U64` / `I64` (64-bit integers)
- [ ] `U128` / `I128` (128-bit integers)
- [ ] `F32` / `F64` (floating-point — `F` suffix exists in grammar but may not be fully implemented)
- [ ] `isize` / `usize` (pointer-sized integers)
- [ ] Overflow checking / wrapping arithmetic
- [ ] Saturating arithmetic
- [ ] Checked arithmetic (returns `Result` on overflow)
