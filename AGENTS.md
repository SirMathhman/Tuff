# Tuff

A small TypeScript (Bun) library that evaluates a Rust-like source subset into a process exit code. The subset: `let` / `let mut` bindings (optional type annotations), `=` / `+=` assignment, `if` / `else`, `while`, blocks, `&` / `&mut` references, `*` dereference (including `*x = v`), array literals and indexing, integer literals with suffixes (`U8`…`I64`, `USize`, `ISize`), comparison and arithmetic expressions, and a trailing `return`.

## Commands

| Task                                             | Command                                                      |
| ------------------------------------------------ | ------------------------------------------------------------ |
| Install deps                                     | `bun install`                                                |
| Run tests (coverage auto-on via `bunfig.toml`)   | `bun test`                                                   |
| Type check                                       | `bunx tsc --noEmit`                                          |
| Lint (type check + `eslint --fix` + size limits) | `bun run lint`                                               |
| Format check / fix                               | `bunx prettier --check .` / `bunx prettier --write .`        |
| Circular deps                                    | `bunx madge --circular --extensions ts <files>`              |
| Copy-paste detection                             | `pmd cpd --minimum-tokens 100 --language typescript <files>` |

These are also wired as hooks in `.github/hooks/` (`lint`, `test`, `format`, `cap-children-per-directory`, `find-circular-files`, `find-circular-packages`, `pmd-cpd`). Run the relevant hook after changes. Note `bun run lint` runs `eslint . --fix`, which auto-modifies files.

## Architecture

Pipeline: `lex → parse → check → evaluate`. The public API is `evaluate(input: string): Result<number, EvalError>` — it returns the exit code, not the evaluator's internal value.

Module layout (dependency direction is acyclic — enforce with `madge --circular`). Each stage lives in its own subdirectory with an `index.ts` barrel:

```
index.ts              — public API: re-exports only, zero side effects
src/evaluate.ts       — composes lex → parse → check → evaluate; enriches errors with source snippets
src/result.ts         — Result monad + combinators (map, andThen, unwrapOr)
src/errors.ts         — EvalError discriminated union (leaf)
src/ast/              — AST node types (expr.ts, statement.ts) + testAst.ts constructors
src/lexer/            — source → tokens with source positions
src/parser/           — tokens → AST
src/check/            — static semantic checks on the AST
src/eval/             — AST → Result<number, EvalError>; value.ts holds Value/Binding + ref resolution
```

Dependency direction: `index → evaluate → {check, eval} → parser → lexer → {errors, result}`, with `ast` and `eval/value` as shared type/leaf modules. `errors` and `result` are leaf modules. No module depends on `index`.

Two-pass design: `check` is the static semantic gate (whole-AST, including dead code); `eval` is purely computational and relies on the static pass's guarantees. Where static kind inference is undecidable (e.g. array element kinds), the check is deferred and re-validated at runtime in `eval` — see the comments in `check.ts` / `eval.ts`. The canonical (aspirational) architecture doc, with design intent and future work, lives in repo memory at `/memories/repo/ARCHITECTURE.md`.

## Conventions

- **Result monad, no throwing.** Every fallible API (public and internal) returns `Result<T, E>`; no module in the pipeline throws.
- **Errors carry position + snippet.** Every `EvalError` has `kind`, `message`, `position` (line/column), and `snippet`. Kinds form a taxonomy keyed to the detecting stage: `syntax` (lexer/parser), `semantic` (type/binding/borrow rules), `mutability` (immutability violations), `runtime` (undefined variables, missing return). A semantic condition is never reported as `syntax`.
- **Exit-code contract.** `evaluate` returns a number. Coercion at the return boundary is explicit and total: number → itself, boolean → 1/0, ref → error. Never leak the internal `Value` type into the public API.
- **Size limits** (enforced by linter/hooks): max 100 lines/function, 500 lines/file, 15 children/directory.
- **Tests** are colocated (`*.test.ts`) and depend only on the module under test. Use `bun:test`. Parser tests build token arrays directly with a `tok()` helper (bypassing the lexer); `src/ast/testAst.ts` provides AST constructors for check/eval tests; `evaluate.test.ts` is the end-to-end suite.
- **Formatting:** Prettier — double quotes, semicolons, 2-space indent, 100-char width.
- **Types:** named interfaces and string enums only — eslint bans inline type literals (`TSTypeLiteral`) and literal-typed properties (the `ok` discriminant in `src/result.ts` is the sole waiver).

## Adding a language feature

Every AST node type must be handled in every stage — the `never` exhaustiveness checks in `check.ts` and `eval.ts` make a missed case a compile error:

1. `src/ast/expr.ts` or `statement.ts` — enum member + interface + union
2. `src/parser/parser.ts` — parse it (precedence-climbing; desugar at parse time, e.g. `+=` → `Binary "="` + `Binary "+"`)
3. `src/check/check.ts` — static validation + kind inference
4. `src/eval/eval.ts` — evaluation
5. `src/ast/testAst.ts` — constructor for tests
6. Tests (colocated + end-to-end in `evaluate.test.ts`)

## Pitfalls

- **No host code generation.** Never evaluate user source via `new Function` or similar — no sandbox, host globals reachable.
- **No textual/regex source rewriting.** Any source transformation must be token/AST-based (regex breaks on strings, comments, and identifiers containing keywords).
- **Every AST node type must be handled explicitly.** An unhandled type must be a compile-time or test-time error, never a silent no-op (see the `never` exhaustiveness check in `eval.ts`).
- **Error-kind misclassification.** Value-kind mismatches at a known binding (e.g. dereferencing a non-reference) are `semantic`, not `runtime`.
- **No hardcoded error positions.** Every error position must point at the offending source.
