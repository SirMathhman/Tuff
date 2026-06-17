# Tuff Language — Agent Instructions

## Project Overview

Single-file Rust recursive-descent parser & interpreter for **Tuff**, a minimal expression-oriented language with typed `i64` values (U8/U16/U32/I8/I16/I32, default I32). No external dependencies (`Cargo.toml` has no `[dependencies]`).

**Build / Test**:

```bash
cargo test --bin tuffc              # all unit tests (must pass before any commit)
cargo llvm-cov --fail-under-lines 95   # coverage gate (enforced by .github/hooks/hooks.json Stop hook)
```

## Architecture & Conventions

- **Single file**: All logic lives in `src/main.rs` (~2700 lines). Keep it this way.
- **Type alias**: Use `ParseResult` (`Result<i64, String>`) for every parser function — never return raw `Option` or custom enums.
- **Grammar** (top of `main.rs`, update when adding features):

  ```
  Program       -> Statement* Expr
  Block         -> '{' Statement* Expr '}'
  Statement     -> let [IDENT ':'] ['mut'] IDENT '=' Expr ';'
                 | fn IDENT '(' [IDENT (',' IDENT)*] ')' '=>' Expr ';'
                 | IDENT ('+'|'-'|'*'|'/')? '=' Expr ';'
                 | while CONDITION body
                 | for (IDENT in START..END) body
                 | if CONDITION body ['else' body]
  LogicalOr     -> LogicalAnd ('||' LogicalAnd)*
  LogicalAnd    -> Comparison ('&&' Comparison)*
  Comparison    -> Expr ((''<''|'>''|'<=''|'>=''|'=='|'!='') Comparison)?
                 | Expr 'is' TYPE
  Expr          -> Term (('+'' | '-') Term)*
  Term          -> Factor (('*' | '/') Factor)*
  Factor        -> '(' Expr ')' | Block | ArrayLiteral '[' Expr ']'
               | StructLiteral '.' IDENT
               | 'if' COND CONS 'else' ALT
               | match (EXPR) { case VAL => RESULT; ... }
               | IDENT '(' [Expr (',' Expr)*] ')'
               | Identifier | Number [TypeSuffix] | BooleanLiteral
  ArrayLiteral  -> '[' [Expr (',' Expr)*] ']'
  StructLiteral -> '{' IDENT ':' Expr (',' IDENT ':' Expr)* '}'
  TypeSuffix    -> U8 | U16 | U32 | I8 | I16 | I32   (case-insensitive)
  ```

## Key Patterns to Follow

1. **Keyword detection**: Use `starts_with_keyword(input, b"kw")` — it handles leading whitespace and word-boundary checks. Add a corresponding `is_kw_statement` predicate next to existing ones (`is_let_statement`, etc.).

2. **Statement dispatchers** (three places that must stay in sync):
   - `parse_body_item` — executes one body item
   - `skip_body_item` — skips one body item without executing
   - `parse_statements_loop` — top-level statement loop

3. **Loop bodies**: When a control-flow construct needs to re-parse its body each iteration (e.g., `while`, `for`), save the remaining input bytes with `.to_vec()` and restore via `unsafe { std::slice::from_raw_parts(...) }` inside the loop. Always call `skip_body_item` after the loop exits so trailing code isn't silently dropped.

4. **Type system**: Numbers carry optional type suffixes (U8, U16, U32, I8, I16, I32; default is I32). The `Env.pending_type` field tracks the inferred type of the most recently evaluated expression. Arithmetic promotes to the wider type via `promote_types()`. Variables store their declared/inferred type for `is TYPE` checks and assignment validation (narrowing rejected, widening allowed).

5. **Division safety**: Before dividing, check `env.rhs_was_variable && !env.proven_nonzero` — if RHS came from a variable without a proven != 0 constraint (`neq_constraint_value`), reject at compile time with `"division by zero: denominator not proven non-zero"`. Runtime check still applies for literal zeros.

6. **Deferred bodies**: Zero-param function calls are queued in `env.deferred_bodies` and drained via `drain_deferred_bodies()` at EOF / scope exit, ensuring all fns are registered before execution.

7. **Anonymous structs/arrays**: Nested struct/array literals use negative IDs as references (e.g., `-1`, `-2`). Registry lives in `env.anonymous_structs` / `env.anonymous_arrays`. Resolve via `resolve_anonymous()` / `resolve_anonymous_array()`.

8. **Tests**: Every new feature gets at least one test in the `#[cfg(test)] mod tests` block, using `execute_tuff("...")`. Test both happy path and error paths. 100% coverage is the goal but edge-case branches that are genuinely hard to cover may be skipped.

9. **Test-first development**: Always write the failing test case before considering any implementation. Every new feature gets at least one test in the `#[cfg(test)] mod tests` block, using `execute_tuff("...")`. Test both happy path and error paths.

10. **Debug by logging**: If you are stuck on an issue, you are required to add temporary `eprintln!` / `dbg!` logging statements to diagnose the problem. Do not guess—insert targeted logs at key parser/interpreter boundaries, run the tests, analyze the output, then remove the logs once resolved.

11. **Coverage gate**: `.github/hooks/hooks.json` runs `cargo llvm-cov --fail-under-lines 95` as a Stop hook — do not land changes that drop coverage below 95%.
