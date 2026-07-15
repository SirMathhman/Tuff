# Tuff Compiler - Agent Instructions

## Project Overview
Tuff is a C-like programming language designed to eliminate undefined behavior, except when interfacing with external code. The compiler (`tuffc`) generates C code that is then compiled with `clang`.

## Build & Test
```bash
cargo build    # Compile
cargo test     # Run tests (50 passing end-to-end tests)
```

## Architecture
- **Codegen approach**: Tuff source → C code → clang → native executable
- **Zero dependencies**: Self-contained compiler, no external crates
- **End-to-end testing**: Tests actually compile and run generated C code via `clang`
- **Single-file compiler**: All code in `src/main.rs` (~1700 lines, tests at line ~1398)

## Tuff Language Features (Implemented)
- `read()` / `read<Bool>()` - reads from stdin; multiple calls map to separate variables
- `let x = expr;` - variable declarations with recursive expression compilation
- `let mut x = ...; x = ...` - mutable variables with reassignment support
- Compound assignment: `+=`, `-=`, `*=`, `/=`
- Type annotations: `let x : I32 = 100`, array types: `let x : [I32; N] = [...]`
- Array literals: `[a, b, c]`, nested arrays: `[[a], [b]]`, repeat syntax: `[val; count]`
- Control flow: `if`, `while`, `for`
- Functions: `fn name(params) => body;`
- Structs: `struct` definitions with C `typedef` generation
- Block expressions with `{ let ...; expr }` for scoped variables
- Braces-to-parens conversion in expressions

## Key Conventions
- Rust 2024 edition
- `compile(source: &str) -> Result<String, CompileError>` - main compiler entry point (returns C code)
- `CompileContext` struct passed mutably between compiler functions (vars, mutable_vars, declared_vars, etc.)
- Test helpers: `expect_valid(source, stdin_str, exit_code)` and `expect_invalid(source)`
- Use `#[allow(dead_code)]` on test helper functions
- Temp files use atomic counter (`TEMP_COUNTER`) for thread-safe naming
- `CompileError = String` - will need custom error enum as compiler grows

## Current Status
Expression-level compiler with let declarations, mutability, arrays (flat & nested), type checking, IO, control flow, functions, and structs. Next: proper lexer → parser AST → typed codegen pipeline.

## Pitfalls
- `main()` currently just prints "Hello, world!" - `compile()` is tested but not wired to CLI args
- Windows-specific (`.exe`, clang on Windows) - consider cross-platform later
- Parser uses string splitting/matching instead of proper tokenization; recursion-based expression compilation can be fragile with nested structures
- Array element assignment (`x[0] = ...`) works via mutable variable tracking but is syntax-lowered, not AST-based
- Parser queue gotcha: if parser emits queued statements (syntax-lowering), EOF loops must drain the queue or trailing lowered declarations are silently dropped

## Gated Checks (`.github/hooks/hooks.json`)
- `cargo test` must pass on stop
- PMD CPD copy-paste detection runs on `src/` with 50-token minimum
- Temp file cleanup silently ignores errors