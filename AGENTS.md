# Tuff — AI Agent Instructions

## Project Overview

Tuff is a minimal programming language interpreter written in TypeScript, built with Bun. The pipeline is: **tokenize → parse (recursive descent) → evaluate**.

The interpreted language supports integers, booleans (`true`/`false`), binary ops (`+`, `-`, `*`, `/`, `||`, `&&`, `<`, `>`, `<=`, `>=`), `let`/`mut` variable declarations, assignment expressions (`x = ...`), `if/else` expressions, blocks `{ }`, and parenthesized groups `( )`. Division uses `Math.trunc` (integer truncation). Booleans evaluate to `1` (true) or `0` (false).

## Commands

| Command          | Description                             |
| ---------------- | --------------------------------------- |
| `bun test`       | Run tests (Bun built-in runner)         |
| `bun run lint`   | Type-check with `tsc --noEmit` + ESLint |
| `bun run cpd`    | PMD copy-paste duplication check        |
| `bun run format` | Prettier auto-format                    |

## Architecture

### Files

| File               | Role                                                                       |
| ------------------ | -------------------------------------------------------------------------- |
| `src/types.ts`     | Shared types: AST nodes, tokens, evaluator types, `BINARY_OPS` registry    |
| `src/tokenize.ts`  | Character-by-character tokenizer                                           |
| `src/parse.ts`     | Recursive descent parser                                                   |
| `src/analyze.ts`   | Semantic analysis: `producesValue`, `getProducesValue`, `lookupScopeEntry` |
| `src/evaluate.ts`  | AST evaluator with linked scope chain                                      |
| `index.ts`         | Re-exports `evaluate`                                                      |
| `index.test.ts`    | All tests (`bun:test`)                                                     |
| `eslint.config.ts` | ESLint flat config — prohibits `TSTypeLiteral` (use named interfaces)      |

### Pipeline

`tokenize(source) → parseProgram(tokens) → evalAst(ast, scope)` exposed via `evaluate(source: string): Result<number, string>`.

All errors use the `Result<T, X>` monad (`OkResult<T>` / `ErrResult<X>`) from `src/types.ts` — **no `throw` anywhere**. At the public boundary, `evaluate()` re-throws internal errors for backward compat, but tests use `checkOk()`/`checkErr()` helpers that work with the Result type directly.

### Parser

Recursive descent with precedence climbing via `parseBinaryOp`:

| Precedence | Operators                                 | Function                     |
| ---------- | ----------------------------------------- | ---------------------------- |
| 1          | `\|\|`                                    | parseBinaryOp                |
| 2          | `&&`                                      | parseBinaryOp                |
| 3          | `<`, `>`, `<=`, `>=`                      | parseBinaryOp                |
| 4          | `+`, `-`                                  | parseBinaryOp                |
| 5          | `*`, `/`                                  | parseBinaryOp                |
| —          | `=` (assignment)                          | parseAssignmentExpr (lowest) |
| —          | literals, identifiers, `( )`, `{ }`, `if` | parseFactor (highest)        |

All binary operator info (precedence + eval function) lives in the `BINARY_OPS` registry in `types.ts` — **single source of truth**.

### Evaluator

Walks the AST over a **linked scope chain** (`ScopeFrame` with `locals: Map<string, ScopeEntry>` + `parent` pointer):

- Variable lookup traverses current → parent → ... → global.
- Block entry creates a child frame; block exit discards it (no cleanup needed).
- `let` declares in the current frame; `mut` assignment walks the chain to find and mutate the owning frame.
- Shadowing is allowed — `let` can redeclare a name in the same scope.
- `if` without `else` returns void when condition is falsy.

## Conventions & Pitfalls

1. **ASI warning**: Never generate code with a newline after `return` — Bun/JS will insert a semicolon, causing unexpected `undefined`.
2. **Parser queue gotcha**: If the parser ever emits queued statements (syntax-lowering), EOF loops must drain the queue or trailing declarations are silently dropped.
3. **Integer division**: `/` uses `Math.trunc`, not floating-point — tests expect integer results.
4. **Block scoping**: Variables declared with `let` inside a `{ }` block are scoped to that block — they're removed from scope when the block exits. Top-level declarations remain in the global scope.
5. **Named interfaces required**: ESLint prohibits `TSTypeLiteral` (inline object types). Always use named `interface` declarations instead of anonymous type literals.
6. **`Result` monad**: ESLint prohibits `ThrowStatement`. All errors use `Result<T, X>` (`Ok`/`Err`) or `EvalError` in the `EvalResult` union. Never use `throw`.
7. **`producesValue` analysis**: The `producesValue()` static analysis in `analyze.ts` determines if an AST node yields a value. Block last-statements, `if/else` (both branches must produce values) — this is used to reject `let x = voidExpr`.
8. **Test style**: Tests use `bun:test` (`import { test, expect } from "bun:test"`), with `checkOk()`/`checkErr()` helpers that work with the `Result` type. Pattern: `test('evaluate("...") => expected', () => { expect(checkOk("...")).toBe(expected); })`.
