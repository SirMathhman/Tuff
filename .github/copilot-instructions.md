# Copilot instructions (Tuff)

## Big picture

- Tuff is a typed expression language with two execution paths:
  - **Interpreter**: `interpret()` → `interpretWithScope()` (stateful evaluation) in `src/main/ts/utils/interpret.ts` and `src/main/ts/core/app.ts`.
  - **Compiler**: `compile()/execute()` compiles Tuff → JS IIFE string, then `eval` in `src/main/ts/compiler/compiler.ts`.
- **Invariant**: everything evaluates to a `number` (booleans become `1/0`; empty input → `0`). Keep this invariant when adding features.

## How to make changes safely

- If you add/modify language behavior, usually update **both**:
  - Interpreter handlers (see the handler chain in `interpretWithScope()` in `src/main/ts/core/app.ts`).
  - Compiler passes (see the multi-pass pipeline in `createTuffCompiler().compile()` in `src/main/ts/compiler/compiler.ts`).
- Interpreter state is threaded through `Map`/`Set` parameters (e.g. `scope`, `typeMap`, `mutMap`, `visMap`, `uninitializedSet`, `movedSet`). Preserve that style instead of introducing global state.
- Compiler is intentionally **string-scanning**, not regex-based. Prefer the existing scanning helpers in `src/main/ts/compiler/parsing/string-helpers.ts` and similar utilities.

## Project-specific conventions (don’t fight these)

- **No regex**: do not use regex literals or `RegExp()`; parse by scanning characters.
- **No classes**: use functions + closures/factories.
- **No `null`**: use `undefined`.
- ESM-only imports; no default exports. Use `import type { ... }` for types.
- Keep files and directories within repo rules (≤8 `.ts` files per directory; avoid cross-subdir circular deps).

## Tests (preferred patterns)

- Use Bun tests and prefer helpers that exercise both execution paths:
  - `itBoth()` / `itAllBoth()` in `src/test/ts/test-helpers.ts`.
- Only use interpreter-only helpers (`itInterpreter`) for features that genuinely aren’t compiled yet.

## Commands & workflows

- Tests: `bun test` (or `bun test src/test/ts/<file>.test.ts`).
- Lint/typecheck: `bun run lint` / `bun run lint:fix`.
- Format: `bun run format`.
- Structure/deps checks: `bun run check:structure`, `bun run check:subdir-deps`, `bun run check:circular`, `npm run visualize`.
- Duplicate detection: `npm run cpd` (expects Java 21; see the script in `package.json`).

## Standard library sources

- `src/main/tuff/*.tuff` are the target stdlib/vision; not all features are implemented.
- Before implementing a `.tuff` feature, check `UNIMPLEMENTED_FEATURES.md` to avoid wiring tests to unsupported syntax.
