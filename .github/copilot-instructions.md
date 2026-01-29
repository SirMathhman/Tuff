# GitHub Copilot Instructions — Tuff

## What this repo is
Tuff is a single-file TypeScript interpreter for a small Rust-ish DSL. The source of truth is the test suite; implementation lives almost entirely in `src/index.ts`.

## Fast workflows
- Dev: `pnpm dev` (runs `ts-node src/index.ts`)
- Tests: `pnpm test` (Jest via `@swc/jest`; tests in `tests/`)
- Typecheck/build: `pnpm typecheck` / `pnpm build`
- Lint/format: `pnpm lint --fix` and `pnpm format`

## Architecture you need to know (read `src/index.ts`)
- Entry: `interpret(input: string): number` evaluates by calling `processBlock(...)`.
- Runtime model: `Type` + `RuntimeValue` + `Context` (a `Map` holding `{mutable, initialized, dropFn}` alongside values).
- “Symbol tables”: `FunctionTable` (`fn ... => ...`), `StructTable` (`struct ... { ... }`), `TypeAliasTable` (`type A = I32 then dropFn`).
- Core evaluation flow:
	- `processBlock()` splits `;`-terminated statements, enforces block scoping, and merges outer vars via `mergeBlockContext()`.
	- `processExprWithContext()` handles DSL constructs (blocks `{...}`, `if (...) ... else ...`, tuples, arrays, structs, calls) then falls back to `evaluateExpression()`.
	- `evaluateExpression()` does operator precedence + runtime type validation (Bool isolation, overflow/range checks for numeric suffixes).

## DSL conventions & sharp edges (add tests in `tests/interpret.test.ts`)
- Numeric types are suffix-based and case-sensitive: `100U8` ok, `100u8` throws `invalid suffix`.
- `Bool` is distinct (only `true`/`false`, stored as 1/0); arithmetic on Bool errors.
- Arrays have ownership rules: assigning a non-literal array value is rejected (`cannot copy arrays`); arrays track “initializedCount” and must be initialized in order.
- References use `&x` / `&mut x` and enforce a single active mutable reference; deref assignment `*ptr = ...` requires a mutable pointer.
- “this” is a synthetic struct snapshot of the current scope; functions can be returned as pointers and may carry a `boundThis` for method-style calls.
- Type constraints exist in declarations: `let x : I32 < 10 = 5;` (value must be `< 10`).

## Repo-specific coding constraints
- ESLint forbids template literals; use string concatenation (see `eslint.config.cjs`).