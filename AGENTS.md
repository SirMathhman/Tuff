# Tuff Compiler - Agent Instructions

## Project Overview
Tuff is a C-like programming language designed to eliminate undefined behavior, except when interfacing with external code. The compiler (`tuffc`) generates C code that is then compiled with `clang`.

## Build & Test
```bash
cargo build    # Compile
cargo test     # Run tests (2 passing baseline tests)
```

## Architecture
- **Codegen approach**: Tuff source → C code → clang → native executable
- **Zero dependencies**: Self-contained compiler, no external crates
- **End-to-end testing**: Tests actually compile and run generated C code

## Key Conventions
- Rust 2024 edition
- `compile(source: &str) -> Result<String, Error>` - main compiler entry point
- Test helpers: `expect_valid(source, stdin, exit_code)` and `expect_invalid(source)`
- Use `#[allow(dead_code)]` on test helper functions
- Temp files use atomic counter for thread-safe naming

## Current Status
Early stage - skeleton with test infrastructure. Next: lexer → parser → codegen.

## Pitfalls
- `std::fmt::Error` is generic - will need custom error enum as compiler grows
- Windows-specific (`.exe`, clang on Windows) - consider cross-platform later
- `expect_valid` ignores `_std_in` parameter currently
- Temp file cleanup silently ignores errors