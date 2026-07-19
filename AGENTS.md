# Tuffc — Tuff Language Compiler

## Quick Start

```bash
cargo test              # Run all tests
cargo clippy            # Check for lint warnings
cargo clippy -- -D clippy::excessive_nesting  # CI check (pre-commit hook)
```

## Pre-commit Hooks

All three must pass before committing:

1. `cargo test` — all tests pass
2. `pmd cpd --dir src --language rust --minimum-tokens 50 --ignore-literals --ignore-identifiers` — no copy-paste violations
3. `cargo clippy -- -D clippy::excessive_nesting` — nesting depth enforced at threshold 2 (see `clippy.toml`)

## Project Structure

```
src/main.rs  — Single crate (no external dependencies, Rust 2024 edition)
```

## Architecture

A compiler from **Tuff** (systems language with zero UB) to **C**, then compiled via `clang`:

1. `compile_tuff_to_c(input) -> Result<String, Error>` — parse & codegen
2. `execute_generated_c(c_code, args) -> i32` — compile with clang, run, return exit code

## Testing

- `expect_valid(input, args, expected_exit_code)` — compiles, runs, asserts exit code
- `expect_invalid(input)` — asserts compilation fails

## Tuff Language Design (Essential)

- **Target**: Experienced C/C++ developers, zero undefined behavior, no `unsafe`
- **Syntax**: Modern C-like (curly braces, semicolons)
- **Memory**: Ownership/borrowing (lexical lifetimes), stack-only initially
- **Types**: Fixed-size ints (U8–U64, I8–I64), F32/F64, Bool, Char, &Str, enums, unions, structs, generics (monomorphized)
- **No**: macros, function overloading, raw pointers, heap allocation (built-in)
- **Self-hosting roadmap**: Stage 0 (host lang) → Stage 1 (minimal Tuff) → Stage 2 (self-compiled)

For the full language specification, see `SPECIFICATION.md` and `UB_PREVENTION.md` when available.