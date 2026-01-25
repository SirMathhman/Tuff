# Tuff – Copilot Instructions

## Big Picture

Tuff is a typed expression language with two execution modes:

- Interpreter: `interpret()` → `interpretWithScope()` in [src/utils/interpret.ts](../src/utils/interpret.ts) and [src/core/app.ts](../src/core/app.ts)
- Compiler: `compile()/execute()` in [src/compiler/compiler.ts](../src/compiler/compiler.ts) (compiles Tuff → JS IIFE, then `eval`)

Everything evaluates to a `number` (booleans map to `1`/`0`; empty input returns `0`).

## Interpreter Model

- `interpretWithScope()` is a handler chain: handlers return `number | undefined`; first non-`undefined` wins.
- State is threaded through via Maps/Sets (scope, types, mutability, visibility, uninitialized tracking).
- When adding a feature: implement a handler and wire it into the order in [src/core/app.ts](../src/core/app.ts).

## Compiler Model

The compiler is a multi-pass string transformer (see [src/compiler/compiler.ts](../src/compiler/compiler.ts)):
parse declarations → validate typed arithmetic → transform structs/control-flow → strip Tuff syntax → hoist `var` decls → literal transforms → method-call rewrite → “statements → expressions” → wrap in IIFE.

## Hard Constraints

- ESLint bans regex literals and `RegExp(...)`, bans `null` (use `undefined`), bans classes, and enforces line limits (see [eslint.config.mjs](../eslint.config.mjs)).
- Repo tools enforce: ≤8 `.ts` files per directory ([tools/check-dir-structure.ts](../tools/check-dir-structure.ts)) and no circular dependencies between `src/*` subdirectories ([tools/check-subdir-deps.ts](../tools/check-subdir-deps.ts)).

## Dev Workflow

- Tests: `bun test` (prefer adding tests via `itBoth()` so interpreter + compiler stay consistent; see [tests/test-helpers.ts](../tests/test-helpers.ts)).
- Lint/format: `bun run lint`, `bun run lint:fix`, `bun run format`.
- Pre-commit runs: `bun test && npm run cpd && bun run format && bun run lint:fix && bun run check:circular && bun run check:structure && bun run check:subdir-deps && npm run visualize` (see [.husky/pre-commit](../.husky/pre-commit)).

Example test pattern:

```ts
import { itBoth } from "../test-helpers";

itBoth("adds", (ok, bad) => {
  ok("let x = 5; x + 3", 8);
  bad("-100U8");
});
```

## Parsing (No Regex)

Parsing is intentionally done via string scanning / char helpers (no regex). See [src/parser.ts](../src/parser.ts) and [src/compiler/parsing/string-helpers.ts](../src/compiler/parsing/string-helpers.ts) for patterns to copy.
