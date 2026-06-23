# Tuff — AI Agent Instructions

## Project Overview

Tuff is a compiler written in Rust that translates `.tuff` source files into C code. The generated C is written to disk and can be compiled with `clang`.

- **Language**: Rust (edition 2024)
- **Build**: `cargo build`, `cargo run`
- **Test**: `cargo test`

## Key Conventions

- Source files use the `.tuff` extension. The compiler reads a `.tuff` file, generates C code, and writes it to a `.c` file.
- Test helpers live in `src/main.rs`:
  - `assert_valid(source, stdin, expected_exit_code)` — compiles Tuff → C → executable, runs it, and asserts the exit code matches.
  - `assert_invalid(source)` — asserts that compilation fails for malformed input.
- When implementing new language features, add test cases using these helpers before writing the compiler logic (TDD).

## Build / Test Commands

| Command        | Purpose                                      |
| -------------- | -------------------------------------------- |
| `cargo build`  | Compile the project                          |
| `cargo run`    | Run the compiler (expects `./src/main.tuff`) |
| `cargo test`   | Run unit tests                               |
| `cargo fmt`    | Format Rust source code                      |
| `cargo clippy` | Lint for common mistakes                     |

## Architecture Notes

- The main entry point is `compile(source: &str) -> Result<&str, Error>` which takes Tuff source and returns generated C code as a string.
- Generated C output is written to disk so it can be compiled externally (e.g., with `clang`).
