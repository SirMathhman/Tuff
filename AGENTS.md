# Tuff

A small TypeScript (Bun) library that evaluates a Rust-like source subset (`let` / `let mut` bindings, expressions, trailing `return`) into a process exit code.

## Commands

| Task                                           | Command                                                      |
| ---------------------------------------------- | ------------------------------------------------------------ |
| Install deps                                   | `bun install`                                                |
| Run tests (coverage auto-on via `bunfig.toml`) | `bun test`                                                   |
| Type check                                     | `bunx tsc --noEmit`                                          |
| Size-limit lint                                | `bun run lint`                                               |
| Format check / fix                             | `bunx prettier --check .` / `bunx prettier --write .`        |
| Circular deps                                  | `bunx madge --circular --extensions ts <files>`              |
| Copy-paste detection                           | `pmd cpd --minimum-tokens 100 --language typescript <files>` |

These are also wired as hooks in `.github/hooks/` (`lint`, `test`, `format`, `cap-children-per-directory`, `find-circular-files`, `pmd-cpd`). Run the relevant hook after changes.

## Architecture

Pipeline: `lex → parse → evaluate`. The public API is `evaluate(input: string): Result<number, EvalError>` — it returns the exit code, not the evaluator's internal value.

Module layout (dependency direction is acyclic — enforce with `madge --circular`):

```
index.ts          — public API: re-exports only, zero side effects
src/evaluate.ts   — composes lex → parse → evaluate; enriches errors with source snippets
src/result.ts     — Result monad + combinators (map, andThen, unwrapOr)
src/errors.ts     — EvalError discriminated union (leaf)
src/lexer.ts      — source → tokens with source positions
src/parser.ts     — tokens → AST
src/eval.ts       — AST → Result<number, EvalError>; semantic checks during evaluation
```

Dependency direction: `index → evaluate → eval → parser → lexer → {errors, result}`. `errors` and `result` are leaf modules. No module depends on `index`.

## Conventions

- **Result monad, no throwing.** Every fallible API (public and internal) returns `Result<T, E>`; no module in the pipeline throws.
- **Errors carry position + snippet.** Every `EvalError` has `kind`, `message`, `position` (line/column), and `snippet`. Kinds form a taxonomy keyed to the detecting stage: `syntax` (lexer/parser), `semantic` (type/binding/borrow rules), `mutability` (immutability violations), `runtime` (undefined variables, missing return). A semantic condition is never reported as `syntax`.
- **Exit-code contract.** `evaluate` returns a number. Coercion at the return boundary is explicit and total: number → itself, boolean → 1/0, ref → error. Never leak the internal `Value` type into the public API.
- **Size limits** (enforced by linter/hooks): max 100 lines/function, 500 lines/file, 15 children/directory.
- **Tests** are colocated (`*.test.ts`) and depend only on the module under test. Use `bun:test`.
- **Formatting:** Prettier — double quotes, semicolons, 2-space indent, 100-char width.

## Pitfalls

- **No host code generation.** Never evaluate user source via `new Function` or similar — no sandbox, host globals reachable.
- **No textual/regex source rewriting.** Any source transformation must be token/AST-based (regex breaks on strings, comments, and identifiers containing keywords).
- **Every AST node type must be handled explicitly.** An unhandled type must be a compile-time or test-time error, never a silent no-op (see the `never` exhaustiveness check in `eval.ts`).
- **Error-kind misclassification.** Value-kind mismatches at a known binding (e.g. dereferencing a non-reference) are `semantic`, not `runtime`.
- **No hardcoded error positions.** Every error position must point at the offending source.
