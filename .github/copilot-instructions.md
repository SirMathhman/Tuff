# Copilot instructions for Tuff

Tuff is a TypeScript interpreter and JS compiler for a tiny expression language (typed integer literals like `100U8`, structs/enums, arrays/tuples/pointers, closures/`this`, loops/`match`, booleans as 1/0).

## Architecture map (start here)

- Public API: `interpret(input, context?)` in `src/interpret.ts` (top-level statements then expression list).
- Statement layer + scoping: `processTopLevelStatements` / `processStatements` in `src/interpreter/statements.ts` (handles let/assign/if/loops/blocks/yield/return/module).
- Expression evaluation: `interpretInternal` + `evaluateBinaryOp` in `src/interpreter/evaluator.ts`; parses via `parseLiteral`/`findOperator` in `src/parser/parser.ts`.
- Primary literals/expressions: `src/parser/literal-parser.ts` (typed numbers, blocks as expressions, `if/else` expr, `match`, calls/field/index/deref, side-channel propagation).
- Types/features: structs/enums (`src/types/structs.ts`, `src/types/enums.ts`), arrays/tuples (`src/types/arrays.ts`, `src/types/tuples.ts`), pointers (`src/types/pointers.ts`), modules (`src/interpreter/modules.ts`), function definitions/refs (`src/interpreter/functions.ts`, `src/common/function-references.ts`).
- Compiler path: `src/compiler/compile.ts` strips let type annotations, rewrites braced expressions to IIFEs (`block-expressions.ts`), expands `read<T>()`, and emits Node-ready JS; `src/compiler/run.ts` MUST call `compile` first then execs the temp JS with provided stdin.
- Interpreter features are being incrementally mirrored in the compiler. The compiler must never execute or fall back to the interpreter. Code duplication between the two frontends is expected; refactor shared pieces instead of piping one through the other.

## Conventions that matter here

- Errors flow via `Result<T>` (`src/common/result.ts`); short-circuit on `type === 'err'`.
- Control-flow markers: `yield <expr>;` → `__YIELD__:<expr>:__` and `return <expr>;` → `__RETURN__:<expr>:__`; markers pass through statement parsing and are evaluated inside expression blocks. Top-level `interpret()` rejects returns (`ReturnSignal` in `parser/function-call-utils.ts`).
- Block scoping: inner `let` bindings never leak; only mutations to existing outer bindings propagate (`createScopedContext` in `interpreter/statements.ts`, `applyScopedMutationsToContext` in `parser/literal-parser.ts`).
- Global registrations: `struct`/`enum`/`fn` register globally; only top-level defs add local bindings. Inner defs can be called globally but do not bind in outer scopes (see `createScopedContext`).
- Side-channels: latest struct instance / function reference tracked in `common/struct-values.ts` and `common/function-references.ts`; ensure they propagate across braced expressions via `propagateSideChannels`.
- Binding identity: updates often mutate existing binding objects (closures rely on reference stability) via `applyUpdatedBindingsInPlace` in `interpreter/evaluator.ts`.
- Assignments inside expression positions are only allowed when explicitly handled (e.g., deref/array) and are rejected in variable initializers unless wrapped in braces.

## Workflows / tooling

- Node >= 20; package manager is pnpm.
- Tests: `pnpm test` (watch: `pnpm test:watch`, coverage: `pnpm test:coverage`); assertions usually inspect `Result` shape.
- Lint: `pnpm lint` / `pnpm lint:fix`. Duplication gate: `pnpm cpd` (PMD CPD, min 50 tokens). Size guard: `npm run check-size`.
- Jest uses SWC (`jest.config.js`); keep code TS/ES2022-friendly.

## Style constraints (don’t fight them)

- Tabs for indentation; avoid regex literals and ternaries; `null` is banned (`undefined` instead). Booleans are numeric.
- Strict complexity/size caps (`max-depth: 2`, `max-lines-per-function: 50`, `max-lines: 500`); extract helpers/modules instead of nesting.
