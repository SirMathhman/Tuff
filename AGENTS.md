# Tuff Compiler

A single-file Rust compiler that translates `.tuff` source to C, then compiles and executes via `cc1`.

## Commands

| Action         | Command                                                    |
| -------------- | ---------------------------------------------------------- |
| Run .tuff file | `cargo run -- src/main.tuff`                               |
| Run tests      | `cargo test`                                               |
| Live reload    | `./watch.ps1` (watches `src/` for `.rs` / `.tuff` changes) |

## Architecture

Everything lives in `src/main.rs` (~1700 lines, single file).

- **`compile_tuff_to_c()`** — main compilation entry point, parses Tuff source and emits C code
- **`execute_tuff(source, stdin)`** — compile + run helper (used by CLI and tests)
- **`run(args)`** — CLI entry point, expects `.tuff` file path as first arg

## Tuff Language

| Feature      | Syntax                                                                 |
| ------------ | ---------------------------------------------------------------------- |
| Variables    | `let x : U8 = 3U8`, `let mut x = ...`                                  |
| Types        | `U8`, `I32`, `Bool` (literal suffixes: `3U8`)                          |
| Arrays       | `[1, 2, 3]`, multi-dimensional with `;` separators in type annotations |
| IO           | `read<U8>()`, `read<Bool>()`, `write<U8>(expr)`                        |
| Control flow | `if (cond) then else other`                                            |
| Return value | Last expression in a block is implicitly returned                      |

## Conventions

- **Test-first**: Always add the test case before considering implementation.
- Tests use `execute_tuff()` with stdin injection — follow existing pattern.
- Clippy denies `cognitive-complexity`; keep functions small and flat (nesting threshold = 3).
