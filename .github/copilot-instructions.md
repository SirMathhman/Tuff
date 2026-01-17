# Copilot instructions for Tuff

Tuff is a small TypeScript interpreter for an expression language (typed integer literals like `100U8`, statements, blocks, structs/enums, functions/closures, loops, `match`, comparisons, boolean logic as 1/0).

## Architecture map (start here)

- Public API: `interpret(input: string): Result<number>` in `src/interpret.ts`.
- Statement processing + scoping: `processTopLevelStatements` / `processStatements` in `src/statements.ts`.
- Expression evaluation: `interpretInternal` + `evaluateBinaryOp` in `src/evaluator.ts`.
- “Primary” parsing: `parseLiteral` in `src/literal-parser.ts` (variables, typed numbers, `{ ... }` expression blocks, `if/else` as expression, `match`, calls/field access/indexing/deref).
- Operator/precedence: `findOperator` in `src/parser.ts` and precedence helpers in `src/common/types.ts`.

## Conventions that matter in this repo

- **Errors flow via `Result<T>`** (`src/common/result.ts`): return early on `type === 'err'`.
- **Control-flow markers** are passed through the statement layer:
  - `yield <expr>;` becomes `__YIELD__:<expr>:__` (`src/statements.ts`) and is evaluated in braced expressions (`src/literal-parser.ts`).
  - `return <expr>;` becomes `__RETURN__:<expr>:__` and ultimately throws `ReturnSignal` (`src/function-call-utils.ts`). Top-level `interpret()` rejects returns.
- **Block scoping rule**: inner `let` bindings do **not** leak; only mutations to already-existing outer bindings propagate (see `createScopedContext` in `src/statements.ts`, and `applyScopedMutationsToContext` in `src/literal-parser.ts`).
- **Global definitions** (`struct`, `enum`, `fn`) are always registered globally; only top-level definitions add local bindings. Inner function definitions (e.g., inside `{ ... }`) register globally but don't leak to outer scope—`{ fn f() => 42; } f()` returns `Err` (see `createScopedContext` in `src/statements.ts`).
- **Side-channels exist**: functions/struct instances are tracked out-of-band via "last captured" helpers (`src/common/function-references.ts`, `src/common/struct-values.ts`). Struct instantiation, `this` keyword, and function references set these; propagate them correctly across braced expressions (see `propagateSideChannels` in `src/literal-parser.ts`).
- **Binding identity is important** (closures may hold references): updates often copy values into existing binding objects rather than replacing arrays wholesale (see `applyUpdatedBindingsInPlace` in `src/evaluator.ts`).

## Workflows / tooling

- Requires Node >= 20; package manager is pnpm.
- Tests: `pnpm test` (watch: `pnpm test:watch`, coverage: `pnpm test:coverage`). Tests live in `tests/*.test.ts` and usually assert on `Result` shape (`type === 'ok' | 'err'`).
- Lint: `pnpm lint` / `pnpm lint:fix`.
- Duplication gate: `pnpm cpd` (PMD CPD, minimum 50 tokens).
- Jest runs via SWC (`jest.config.js`), so syntax should stay TS/ES2022-friendly.

## Style constraints (don’t fight them)

- Tabs for indentation; no regex literals; no ternaries; `null` is banned (use `undefined`).
- Very tight complexity/size caps (`max-depth: 2`, `max-lines-per-function: 50`, `max-lines: 500`): if you need more room, extract helpers into a new module instead of nesting.
