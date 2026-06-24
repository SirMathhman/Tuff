# Tuff — AI Agent Instructions

## Project Overview

Tuff is a compiler written in Rust that translates `.tuff` source files into C code. The generated C is written to disk and can be compiled with `clang`.

- **Language**: Rust (edition 2024)
- **Build**: `cargo build`, `cargo run`
- **Test**: `cargo test`
- **Single-file codebase**: Everything lives in `src/main.rs` (~850 lines). No modules or external dependencies.

## Tuff Language Grammar

The language supports these constructs (all values are integers):

| Construct       | Syntax Example                  | Description                    |
| --------------- | ------------------------------- | ------------------------------ |
| Literals        | `42`, `true`, `false`           | Integer and boolean literals   |
| Variables       | `let x = 5;` / `let mut x = 1;` | Immutable or mutable binding   |
| Assignment      | `x = read();`                   | Reassign a mutable variable    |
| Compound assign | `x += read();`                  | Add-and-assign                 |
| Addition        | `a + b`                         | Integer addition               |
| Comparison      | `a < b`                         | Less-than (returns 0 or 1)     |
| If/else         | `if (cond) then else otherwise` | Ternary conditional            |
| Blocks          | `{ let y = x; y }`              | Scoped let + statements        |
| Loops           | `loop { break expr; }`          | Infinite loop with break value |
| I/O             | `read()`, `readBool()`          | Read int / bool from stdin     |

Programs are a sequence of declarations and assignments followed by an optional final expression. The final expression's value becomes the program's exit code.

## Key Conventions

- Test helpers live in `src/main.rs`:
  - `assert_valid(source, stdin, expected_exit_code)` — compiles Tuff → C → executable via `clang`, runs it with piped stdin, and asserts the exit code matches.
  - `assert_invalid(source)` — asserts that compilation fails for malformed input.
- **TDD workflow**: When implementing new language features, add test cases using these helpers _before_ writing compiler logic.

## Architecture (top to bottom in `src/main.rs`)

1. **`AstExpr`** — enum of AST nodes (`Read`, `Var`, `Add`, `If`, `Block`, etc.)
2. **Lexer** — `tokenize()` produces a flat `Vec<Token>` from source text
3. **Parser** — `Parser::parse_program()` builds the AST; recursive descent with `parse_expr() → parse_term()` precedence
4. **Codegen** — `compile()` flattens blocks/loops/if-statements into C declarations, then emits `main()` with a `return <final_expr>;`
5. **Tests** — integration tests that invoke `clang` as an external subprocess

Generated C always includes two runtime helpers: `read_val()` (integer input) and `read_bool()` (string-to-bool).

## Build / Test Commands

| Command        | Purpose                                      |
| -------------- | -------------------------------------------- |
| `cargo build`  | Compile the project                          |
| `cargo run`    | Run the compiler (expects `./src/main.tuff`) |
| `cargo test`   | Run unit tests                               |
| `cargo fmt`    | Format Rust source code                      |
| `cargo clippy` | Lint for common mistakes                     |
