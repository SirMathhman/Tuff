# GitHub Copilot Instructions — Tuff

## Repo shape

- Interpreter + CLI live in `src/index.ts` (single-file, ~3k LOC; most logic is inside `interpret()`).
- The DSL spec is the test suite, especially `tests/interpret.test.ts` (many tests assert exact error messages).
- The CLI runner (`pnpm start` / `pnpm dev`) executes `bun ./src/index.ts`, which loads `src/index.tuff` and prints `interpret(...)`.
- For DSL syntax and semantics overview, see [TUTORIAL.md](../TUTORIAL.md).

## Skills and utilities

- Reusable skills and utilities are located in `.github/skills/`.
- Each skill provides specialized functionality with documentation.
- When working on tasks that require code extraction, refactoring, or file manipulation, check `.github/skills/copy-and-paste/` for the copy-paste utility and its documentation.
- Read skill documentation in the relevant `SKILL.md` file before using to understand capabilities and best practices.

## Fast workflows

- Dev: `pnpm dev` (nodemon watches `src/**/*.ts` and `*.tuff`; runs `bun ./src/index.ts`)
- Tests: `pnpm test` (Jest via `@swc/jest`)
- Typecheck/build: `pnpm typecheck` / `pnpm build`
- Lint/format: `pnpm lint` and `pnpm format`

## Interpreter mental model (read `src/index.ts`)

- Entry: `interpret(input: string): number` strips comments then evaluates by calling `processBlock(...)`.
- Parsing strategy is string-based (regex + bracket-depth scans), not a separate AST.
- Runtime model: `Type` + `RuntimeValue` + `Context` (a `Map` holding `{ mutable, initialized, dropFn }` alongside values).
- Symbol tables: `FunctionTable` (`fn ... => ...`), `StructTable` (`struct ... { ... }`), `TypeAliasTable` (`type A = I32 then drop`).
- Core flow:
  - `processBlock()` splits `;`-terminated statements, enforces block scoping, and merges outer vars via `mergeBlockContext()`.
  - `processExprWithContext()` handles higher-level constructs (blocks `{...}`, `if (...) ... else ...`, tuples, arrays, structs, calls) then falls back to `evaluateExpression()`.
  - `evaluateExpression()` does operator precedence + type validation (Bool isolation, overflow/range checks for numeric suffixes).

## DSL sharp edges (tests cover these)

- Numeric suffixes are case-sensitive: `100U8` ok, `100u8` throws `invalid suffix`.
- `Bool` is distinct (`true`/`false`, stored as 1/0); arithmetic on Bool errors.
- Arrays: assigning a non-literal array value is rejected (`cannot copy arrays`); arrays track `initializedCount` and must be initialized in order.
- References: `&x` / `&mut x`; only one active mutable reference; deref assignment `*ptr = ...` requires a mutable pointer.
- `this` is a synthetic snapshot of the current scope; functions can be returned as pointers and may carry `boundThis` for method-style calls; `::` extracts unbound function pointers.
- Type constraints exist in declarations: `let x : I32 < 10 = 5;`.

## Repo constraints

- ESLint forbids template literals; use string concatenation / array-join for messages.
