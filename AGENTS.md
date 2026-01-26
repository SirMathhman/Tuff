# Tuff - Agent Instructions

## Architecture Overview

Tuff is a typed expression language with **two execution modes**:

1. **Interpreter**: `interpret()` → `interpretWithScope()` ([src/utils/interpret.ts](../src/utils/interpret.ts), [src/core/app.ts](../src/core/app.ts))
   - Handler chain: handlers return `number | undefined`; first non-`undefined` wins
   - State threaded via Maps/Sets (scope, types, mutability, visibility, uninitialized tracking)
2. **Compiler**: `compile()/execute()` ([src/compiler/compiler.ts](../src/compiler/compiler.ts))
   - Multi-pass string transformer: parse → validate → transform → strip syntax → hoist vars → literals → rewrites → wrap IIFE
   - Compiles Tuff → JavaScript IIFE, then `eval`

**Key invariant**: Everything evaluates to `number` (booleans → `1`/`0`; empty input → `0`).

## Coding Standards

### Imports & Structure

- Use ESM imports: `import { ... } from "../path"` (no default exports)
- Type imports: `import type { TypeName } from "../module"`
- Line length: ≤280 chars per file (skip comments/blanks); functions ≤50 lines
- Max 8 `.ts` files per directory; no circular dependencies between `src/*` subdirectories

### Types & Null Safety

- **Strict mode enabled**: all types checked, no implicit `any`, `noUncheckedIndexedAccess`
- **Never use `null`**: use `undefined` instead (eslint enforces this)
- Use exhaustive type checks; prefer `satisfies` for type validation
- Generics: use uppercase `T`, `U` for type params; infer when possible

### Naming & Conventions

- Variables: `camelCase`; constants: `UPPER_CASE`; unused params: prefix with `_` (e.g., `_param`)
- Functions: descriptive names like `tryDeclarations()`, `handleVarDecl()`, `findImportedModules()`
- Files: lowercase with hyphens (`var-extraction.ts`, `string-helpers.ts`)

### No Regex, No Classes

- **No regex literals or `RegExp()` constructor**: parse strings via char scanning helpers
- **No class declarations/expressions**: use functions with closures or factory patterns
- See [src/parser.ts](../src/parser.ts) and [src/compiler/parsing/string-helpers.ts](../src/compiler/parsing/string-helpers.ts) for examples

### Error Handling

- Throw errors with descriptive messages (no silent failures)
- Use `try/catch` for runtime validation; validation errors are explicit
- Catch-error patterns must name the error (no `_` for caught values)

## Commands

### Testing

- `bun test` – run all tests
- `bun test path/to/file.test.ts` – run single test file
- **Prefer `itBoth()`**: tests interpreter + compiler together (see [tests/test-helpers.ts](../tests/test-helpers.ts))

### Lint & Format

- `bun run lint` – type check + ESLint
- `bun run lint:fix` – auto-fix lint errors
- `bun run format` – prettier format
- `npm run cpd` – duplicate code detection (min 35 tokens)

### Checks

- `bun run check:circular` – detect circular dependencies
- `bun run check:structure` – verify ≤8 files per directory
- `bun run check:subdir-deps` – check subdirectory deps
- `npm run visualize` – generate dependency graph

### Pre-commit

All checks run automatically: `bun test && npm run cpd && bun run format && bun run lint:fix && bun run check:circular && bun run check:structure && bun run check:subdir-deps && npm run visualize`

## Test Example

```ts
import { itBoth } from "../test-helpers";

describe("arithmetic", () => {
  itBoth("adds numbers", (assertValid, assertInvalid) => {
    assertValid("1 + 2", 3);
    assertInvalid("-100U8"); // negative unsigned
  });
});
```
