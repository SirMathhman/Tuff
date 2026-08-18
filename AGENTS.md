# Tuff (tuffc)

The Tuff compiler: a small expression language evaluated by `evaluate()` in `src/index.ts` (tokenizer → recursive-descent parser → evaluator, single file).

## Commands

| Task                 | Command                |
| -------------------- | ---------------------- |
| Test (with coverage) | `pnpm test:jest`       |
| Format check         | `pnpm format:prettier` |
| Typecheck            | `pnpm lint:typecheck`  |
| Lint                 | `pnpm lint:eslint`     |
| Duplication check    | `pnpm lint:pmd:cpd`    |

There is no plain `test` script. A `Stop` hook (`.github/hooks/hooks.json`) runs all five of these automatically and blocks the stop if any fail — keep the tree green before finishing.

## Conventions

- **100% coverage is enforced** (statements/branches/functions/lines, `jest.config.js`). When you add a branch, add a test for it. Tests added purely to satisfy coverage must carry a `// Coverage: <branch>` comment so they can be updated later when behavior changes.
- **Flat tests only**: use top-level `test()` calls, no `describe` blocks.
- **ESM + NodeNext**: imports of local files use `.js` specifiers (e.g. `import { evaluate } from "./index.js"`); jest maps them via `moduleNameMapper`.
- **Structured errors**: `evaluate` returns `{ ok: false, error }` with a discriminated `EvaluateError` kind (`invalid-number`, `malformed-expression`, `unknown-variable`, `immutable-assignment`, `invalid-dereference`, `reference-as-value`). Error `reason` strings are exact and asserted verbatim in tests — changing a message breaks tests.
- **Language semantics** (documented in `src/index.ts`): `+`/`-`/`*` with `*` binding tighter, left-to-right; `()` or `{}` grouping; `let`/`let mut` bindings and `x = expr;` assignments; block-scoped variables with shadowing; only `mut` bindings assignable; empty input evaluates to 0. References: `let y = &x;` (shared) or `let y = &mut x;` (requires `x` to be `mut`) bind a reference; `*y` reads the pointee; `*y = expr;` writes through a mutable reference. References store a direct object pointer to the target binding (tracks reassignment, immune to shadowing); `&` of a reference is rejected; reading a reference as a value is a `reference-as-value` error and `*` of a non-reference is an `invalid-dereference` error.
- **Style limits** (`eslint.config.js`): max 300 lines/file and 50 lines/function (warn) — keep functions small.

## Pitfalls

- PowerShell mangles double-quoted git commit messages — use single quotes for `git commit -m`.
- `pmd cpd` flags duplicated code (min 100 tokens) — avoid copy-paste between parser branches.
