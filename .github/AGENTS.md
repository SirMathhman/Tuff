# Tuff — AI Agent Instructions

## Project Overview

A zero-dependency Rust interpreter/REPL for a simple expression language with variables, blocks, and control flow. Edition 2024, no external crates.

## Architecture

- `src/main.rs` — REPL entry point + all tests (tests call into parser module)
- `src/parser.rs` — Recursive-descent parser, statement/expression parsing
- `src/scope.rs` — Value enum (`Int`, `Range`), ParseError, Scope stack helpers, and integer literal utilities (`extract_int`, `extract_suffix`)
- `src/lexer.rs` — Tokenization only (`pub fn tokenize`, returns `Vec<String>`)

> **File size limit**: Each `.rs` file must stay under 20,000 characters. When a module grows too large, extract types/helpers into a new module (e.g., scope.rs was split from parser.rs).

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

- **Literals**: integers (`i64`) with optional uppercase type suffixes like `U8`, `I32` (suffix is validated at parse time, value stored as i64). Lowercase suffixes cause errors.
- **Variables**: `let x = expr;`, typed via `let x : U8 = 100U8;`. Mutable via `let mut x = ...` or bare assignment `x = val`. Type widening allowed (e.g., `U8 → U16`), narrowing rejected. Non-numeric types (e.g., `Bool`) are incompatible with numeric type widths.
- **Type-check operator**: `expr is TYPE` returns 1 if the value's type width fits within `TYPE`, 0 otherwise. Works on literals (`100U8 is U8`) and typed variables (`let x : U8; x is U8`).
- **Blocks**: `{ stmts }` with lexical scoping and shadowing
- **Arithmetic**: `+ - * / %` with standard precedence (integer division truncates toward zero)
- **Comparisons**: `< > <= >=` → returns 1 (true) or 0 (false)
- **Logical**: `&& ||` short-circuit evaluation, result is 1 or 0
- **Conditionals**: expression form `if (cond) a else b`, statement form `if (cond) stmt [else stmt]` with block `{}` or single-statement bodies
- **Match expressions**: `match (value) { case pattern => expr; case _ => fallback; }`. First matching arm wins. Wildcard `_` acts as default — only used if no prior arm matched.
- **Loops**: `while (cond) stmt`, `for (i in start..end) stmt`, and range variables (`let r = 0..4; for (i in r) ...`). Max 1024 iterations per loop, returns error on infinite loops.
- **Compound assignment**: `+=`

## Gotchas

### Lexer

- Never call `.peek()` twice on the same `Peekable<Chars>` to look ahead — it consumes. Use `.clone().nth(1)` instead (see `<`, `>`, `+` handling).
- `-` is ambiguous between unary minus and subtraction operator. The lexer disambiguates by checking the **previous token** — if previous token is an operand (`(`, `*`, etc.), it starts a number literal; otherwise it's the subtraction operator.

### Parser

- Scope stack: innermost frame is last element of `Vec`. `get()` searches innermost-first for shadowing support.
- `parse_factor` handles both variable references and assignment expressions — it peeks ahead to distinguish `x = ...` from bare `x`.
- Integer literals use `extract_int()` which strips uppercase suffixes before parsing (e.g., `"100U8"` → `100`). Type checking happens in the let-declaration handler via `check_type()`.

### Match Expressions

- Loop logic: arms are parsed by checking for `"case"` at loop top. Semicolons between arms are consumed **after** each arm body (not before), otherwise trailing `;` is skipped and next iteration hits `}` → break prematurely.
- Wildcard (`_`) only sets result if no prior non-wildcard arm matched — never overwrites a successful match.

### General

- Parser queue gotcha: if parser emits queued statements (syntax-lowering), EOF loops must drain the queue or trailing lowered declarations are silently dropped.
