# Tuff — Project Guidelines

## Overview

`tuff` is a custom programming language interpreter written in Rust. The core entry point is `src/main.rs`, which drives a REPL loop and delegates evaluation to `interpret_tuff(source: &str)`.

## Build and Test

| Command       | Purpose                    |
| ------------- | -------------------------- |
| `cargo build` | Compile the binary         |
| `cargo run`   | Run the interpreter (REPL) |
| `cargo test`  | Run tests                  |
| `cargo check` | Fast compilation check     |

## Conventions

- **Rust 2024 edition** — use modern Rust features where appropriate
- **Pure stdlib first** — prefer standard library solutions before adding external crates; justify new dependencies
- **TDD preferred** — write tests before implementing new interpretation logic
- As the codebase grows, split `src/main.rs` into modules under `src/` (e.g., `parser/`, `ast/`, `evaluator/`)
