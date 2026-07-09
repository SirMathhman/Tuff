# Tuff — AI Agent Instructions

## Project Overview

A zero-dependency Rust interpreter/REPL for a simple expression language with variables, blocks, and control flow.

## Architecture

- `src/main.rs` — REPL entry point + all tests (tests call into parser module)
- `src/parser.rs` — Scope management, statement/expression parsing, if-condition helpers
- `src/lexer.rs` — Tokenization only (`pub fn tokenize`)

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

- **Test-first**: Always add the test case in `src/main.rs` _before_ implementing any new feature or fixing a bug. The hook will block commits that don't pass with 100% coverage, so write the failing test first, then implement just enough code to make it pass and cover all branches.

## Interpreter Language Features

- Variables: `let x = expr`, mutable via `mut` or bare assignment `x = val`
- Blocks: `{ stmts }` with lexical scoping and shadowing
- Arithmetic: `+ - * / %` with standard precedence
- Comparisons: `< > <= >=` → returns 1 (true) or 0 (false)
- Logical: `&& ||` short-circuit evaluation
- Conditionals: expression form `if (cond) a else b`, statement form `if (cond) stmt [else stmt]` with block `{}` or single-statement bodies
- Compound assignment: `+=`

## Lexer Gotcha

Never call `.peek()` twice on the same `Peekable<Chars>` to look ahead — it returns the **same** character. Use `.clone().nth(1)` instead (see `<`, `>`, `+` handling).
