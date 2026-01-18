# Copilot instructions for Tuff

Tuff is a tiny expression language implemented in TypeScript with **two frontends**: an interpreter and a source-to-source JS compiler.

## Where to start (key entrypoints)

- Public API: `interpret(input, context?)` in `src/interpret.ts` → `Result<number>`.
- Compiler: `compile(input)` in `src/compiler/compile.ts` → JS string; `run(input, stdin)` in `src/compiler/run.ts` executes the JS with Node.

## Architecture + “gotchas”

- **Result everywhere**: functions return `Result<T>` from `src/common/result.ts` (`{ type: 'ok', value } | { type: 'err', error }`). Always branch on `type`.
- **Compiler is string-transform based**: most compilation is in `src/compiler/transforms/*` plus block handling in `src/compiler/block-expressions.ts` + `src/compiler/block-parsing.ts`.
- **Compilation pipeline order matters** (see `src/compiler/compile.ts`): structs/modules/functions/`this` must run before block-expression IIFEs.
- **No interpreter fallback in compiler runtime**: `run()` must compile first (see the “DO NOT CHANGE THIS” guard in `src/compiler/run.ts`).
- **Constant validation reuses the evaluator**: `validateConstantExpressions()` in `src/compiler/validation.ts` calls `interpretInternal` only for “pure constant” code (skips anything with `let`, `read<`, `fn`, braces, etc.). Don’t expand this into a general fallback.

## Tests (pick the right helper)

Helpers live in `src/testing/test-helpers.ts` and reset global registries (functions/modules/structs/enums) between runs.

- Dual-path (preferred when possible): `assertInterpretAndCompileValid/Invalid(...)`.
- Interpreter-only (semantic/runtime-only checks): `assertInterpretInvalid(...)`.
- Compiler-only (stdin-dependent): `assertCompileValid(input, stdin, expected)`.

## When changing the language

- Implement behavior in **both** the interpreter (`src/interpreter/*`) and compiler transforms (`src/compiler/*`). They are separate implementations.
- If logic must be shared, extract into `src/common/*` (don’t route the compiler through `interpret()`).

## Dev workflows (Node >= 20)

- `pnpm test` / `pnpm test:watch` / `pnpm test:coverage`
- `pnpm lint` / `pnpm lint:fix`
- `pnpm cpd` (copy/paste detector)
- `pnpm check-size` (repo size gate)

## Repo-specific constraints (don’t fight them)

- Tabs for indentation in TS (`indent: ['error', 'tab']`).
- Max depth 2, max 50 lines/function, max 500 lines/file → extract helpers early.
- No ternaries, no regex literals, no `null`, no `Record`, no anonymous object types (create a named `interface`).
