# Tuff

Tuff is a small embedded language ("tuffness") implemented in TypeScript on Bun. Public API: `evaluateTuff(source: string): TuffResult` in `src/index.ts` — a thin facade running the pipeline **tokenize → parse → typecheck → execute**.

The full canonical architecture (language spec, invariants, module dependency graph, known design gaps, future work) lives in the agent's repository memory at `/memories/repo/architecture.md` — read it before making structural changes. Dev-environment notes are in `/memories/repo/notes.md`.

## Commands

| Command                  | Purpose                                                                 |
| ------------------------ | ----------------------------------------------------------------------- |
| `bun run test`           | Run all tests (`bun test`, coverage to `coverage/lcov.info`)            |
| `bun run lint`           | `tsc --noEmit && eslint .` — run after any change                       |
| `bun run callgraph`      | Regenerate `docs/callgraph.dot` / `.svg` (needs Graphviz `dot` on PATH) |
| `bun run madge:circular` | Check for circular imports                                              |
| `bun run pmd:cpd`        | Copy-paste detection (needs PMD installed)                              |

No build step — Bun runs TypeScript directly; imports use explicit `.ts` extensions.

## Architecture

- `src/index.ts` — facade; owns the pipeline; maps tokenizer failure to `UnexpectedCharacter`; asserts no control signal escapes.
- `src/tokenizer.ts` — source → tokens; no semantic knowledge; failure is a structured value.
- `src/parser.ts` — program-level parse loop; re-exports `ast.ts` types for import compatibility.
- `src/ast.ts` — single home of AST node interfaces and `Pos`.
- `src/statements.ts` / `src/expr.ts` — statement and expression parsers; mutual recursion broken by passing the statement parser as a `ParseStatement` parameter.
- `src/typecheck.ts` + `src/typecheck/kinds.ts` + `src/typecheck/expressions.ts` — static pass, **the sole source of semantic errors** (undeclared identifiers, mutability, kind mismatches, invalid deref, index bounds, break/continue outside loops).
- `src/evaluator.ts` — pure executor; walks a typechecked AST with an `Environment`; returns only `TuffOk` or `undefined`. `break`/`continue` are structural `ControlSignal` values consumed only by the innermost loop.
- `src/scopes.ts` — `Binding`, `Environment` (scope chain + reference registry).
- `src/values.ts` — `TuffValue` tagged union (number/bool/tuple/array).
- `src/errors.ts` — leaf module; `TuffError` structured union.
- Tests: `core.test.ts`, `expressions.test.ts`, `control-flow.test.ts` (all through the public `evaluateTuff`); `test-helpers.ts` has assertion helpers.
- `tools/` — self-contained call-graph tooling; depends on nothing in `src/`.

## Conventions (enforced by ESLint — see `eslint.config.ts`)

- **Errors are values, never thrown.** `throw` is banned; return `TuffErr`. The only sanctioned throws are `node:assert` guards in the evaluator — a tripped assert means a typechecker bug, not a program error.
- **No classes** (use plain functions) and **no inline type literals** (use named interfaces).
- **Mandatory JSDoc** on function declarations, methods, interfaces, type aliases, and enums, with param/returns descriptions.
- **File size limits:** 300 lines per file, 50 lines per function (warnings).
- **Typechecker is the sole semantic gate.** The evaluator performs no semantic checks; do not add error returns to it.
- **Mutual recursion is broken by passing functions as parameters** (`ParseStatement`, `ExecuteList`, `ResolveDeref`), never by circular imports.
- **Tests use `bun:test`** (`import { expect, test } from "bun:test"`), not Jest/Vitest.
- Public result rendering: booleans render as 1/0, tuples/arrays as element count; the tagged `TuffValue` domain never crosses the public boundary.

## Pitfalls

- **Flaky Bun shutdown segfault (Windows):** `bun run test` intermittently segfaults at process shutdown _after all tests pass_ (exit code 3). If the run fails with a segfault but the summary shows all tests passing, re-run — it is flaky, not a real failure.
- `typescript` is a peerDependency, not a devDependency — it must be installed for `bun run lint` and `tools/callgraph.ts`.
- Line numbers in errors are currently statement indices, not real source lines (known gap; see architecture memory).
