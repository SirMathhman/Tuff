# Tuff — Project Guidelines

## Overview

`tuff` is a custom programming language interpreter written in Rust. The core entry point is `src/main.rs`, which drives a REPL loop and delegates evaluation to `interpret_tuff(source: &str) -> i64`.

The interpreter uses **recursive parenthesization**: it finds the innermost grouped sub-expression (`(...)` or `{...}`), recursively evaluates it, then substitutes the result back into the string before splitting on operators. Operator precedence is handled via two passes — `*`/`/` first (left-associative), then `+`/`-`.

## Build and Test

| Command                                | Purpose                             |
| -------------------------------------- | ----------------------------------- |
| `cargo build`                          | Compile the binary                  |
| `cargo run`                            | Run the interpreter (REPL)          |
| `cargo test`                           | Run tests                           |
| `cargo check`                          | Fast compilation check              |
| `cargo llvm-cov --fail-under-lines 95` | Check test coverage (≥95% required) |

## Conventions

- **Rust 2024 edition** — use modern Rust features where appropriate
- **Pure stdlib first** — prefer standard library solutions before adding external crates; justify new dependencies
- **TDD preferred** — write tests in `#[cfg(test)] mod tests` at the bottom of `src/main.rs` before implementing new interpretation logic
- As the codebase grows, split `src/main.rs` into modules under `src/` (e.g., `parser/`, `ast/`, `evaluator/`)

## Automation

A hook is configured at `.github/hooks/hooks.json` that runs `cargo llvm-cov --fail-under-lines 95` at session stop — all changes must maintain ≥95% line coverage.
