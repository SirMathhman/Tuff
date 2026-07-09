# Tuff — AI Agent Instructions

## Project Overview

A zero-dependency Rust interpreter/REPL for a simple expression language with variables, blocks, and control flow. Edition 2024, no external crates.

## Architecture

- `src/main.rs` — REPL entry point + all tests (tests call into parser module)
- `src/parser.rs` — Recursive-descent parser, scope management, statement/expression parsing
- `src/lexer.rs` — Tokenization only (`pub fn tokenize`, returns `Vec<String>`)

### Parser Precedence Hierarchy (lowest → highest)

```
parse_expression    →  ||
parse_and           →  &&
parse_comparison    →  < > <= >=
parse_additive      →  + -
parse_term          →  * / %
parse_factor        →  literals, parens, blocks, variables, if-expressions
```

All binary operators are **left-associative** (implemented as Pratt-style `while` loops at each level).

## Build & Test Commands

```powershell
# Run full test suite with 100% line coverage enforcement (required by CI)
cargo +nightly llvm-cov --fail-under-lines 100 --show-missing-lines

# Quick test run without coverage threshold
cargo test
```

## Hard Conventions (Enforced by `.github/hooks/hooks.ps1`)

| Rule            | Detail                                                                                                            |
| --------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Coverage**    | 100% line coverage required. Every new feature needs tests that hit all branches.                                 |
| **Duplication** | PMD CPD: no repeated blocks >50 tokens (ignoring literals/identifiers). Extract helpers when duplication appears. |
| **File size**   | Max 20,000 characters per `.rs` file. Split into modules if exceeded.                                             |

## Workflow

- **Test-first**: Always add the test in `src/main.rs` _before_ implementing any new feature or fixing a bug. The hook blocks commits without 100% coverage — write the failing test first, then implement minimally to pass and cover all branches.
- Tests go in `#[cfg(test)] mod tests { ... }` inside `main.rs`, calling `parser::interpret()`.

## Interpreter Language Features

- Literals: integers (`i64`), `true` / `false` keywords (evaluate to 1 / 0)
- Variables: `let x = expr;`, mutable via `let mut x = ...` or bare assignment `x = val`
- Blocks: `{ stmts }` with lexical scoping and shadowing
- Arithmetic: `+ - * / %` with standard precedence (integer division truncates toward zero)
- Comparisons: `< > <= >=` → returns 1 (true) or 0 (false)
- Logical: `&& ||` short-circuit evaluation, result is 1 or 0
- Conditionals: expression form `if (cond) a else b`, statement form `if (cond) stmt [else stmt]` with block `{}` or single-statement bodies
- Loops: `while (cond) stmt` — body evaluated via replay pattern (max 1024 iterations, returns error on infinite loop detection)
- Compound assignment: `+=`

## Gotchas

### Lexer

- Never call `.peek()` twice on the same `Peekable<Chars>` to look ahead — it consumes. Use `.clone().nth(1)` instead (see `<`, `>`, `+` handling).
- `-` is ambiguous between unary minus and subtraction operator. The lexer disambiguates by checking the **previous token** — if previous token is an operand (`(`, `*`, etc.), it starts a number literal; otherwise it's the subtraction operator.

### Parser

- Scope stack: innermost frame is last element of `Vec`. `get()` searches innermost-first for shadowing support.
- `parse_factor` handles both variable references and assignment expressions — it peeks ahead to distinguish `x = ...` from bare `x`.
