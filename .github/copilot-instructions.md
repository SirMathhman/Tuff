# Tuff Language — Agent Instructions

## Project Overview

Single-file Rust recursive-descent parser & interpreter for **Tuff**, a minimal expression-oriented language with `i64` values only. No external dependencies (`Cargo.toml` is empty).

**Build / Test**:

```bash
cargo test --bin tuffc   # all unit tests (must pass before any commit)
```

## Architecture & Conventions

- **Single file**: All logic lives in `src/main.rs`. Keep it this way.
- **Type alias**: Use `ParseResult` (`Result<i64, String>`) for every parser function — never return raw `Option` or custom enums.
- **Grammar** (top of `main.rs`, update when adding features):
  ```
  Program   -> Statement* Expr
  Block     -> '{' Statement* Expr '}'
  Statement -> let ['mut'] IDENT '=' Expr ';'
             | IDENT ('+'|'-'|'*'|'/')? '=' Expr ';'
             | while CONDITION body
             | for (IDENT in START..END) body
             | if CONDITION body ['else' body]
  Expr      -> LogicalOr (('&&'|'||') LogicalOr)*
  Factor    -> '(' Expr ')' | Block | 'if' COND CONS ALT
             | match (EXPR) { case VAL => RESULT; ... }
             | Identifier | Number | BooleanLiteral
  ```

## Key Patterns to Follow

1. **Keyword detection**: Use `starts_with_keyword(input, b"kw")` — it handles leading whitespace and word-boundary checks. Add a corresponding `is_kw_statement` predicate next to existing ones (`is_let_statement`, etc.).

2. **Statement dispatchers** (three places that must stay in sync):
   - `parse_body_item` — executes one body item
   - `skip_body_item` — skips one body item without executing
   - `parse_statements_loop` — top-level statement loop

3. **Loop bodies**: When a control-flow construct needs to re-parse its body each iteration (e.g., `while`, `for`), save the remaining input bytes with `.to_vec()` and restore via raw pointers inside the loop. Always call `skip_body_item` after the loop exits so trailing code isn't silently dropped.

4. **Tests**: Every new feature gets at least one test in the `#[cfg(test)] mod tests` block, using `execute_tuff("...")`. Test both happy path and error paths. 100% coverage is the goal but edge-case branches that are genuinely hard to cover may be skipped.

5. **No unsafe outside loops**: The only `unsafe` blocks should be raw-slice restoration in loop constructs. Everything else stays safe Rust.
