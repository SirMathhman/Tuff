# Tuff - Agent Instructions

## Architecture Overview

Tuff is a typed expression language with **two execution modes**:

1. **Interpreter**: `interpret()` → `interpretWithScope()` (src/main/ts/utils/interpret.ts, src/main/ts/core/app.ts)
   - Handler chain: handlers return `number | undefined`; first non-`undefined` wins
   - State threaded via Maps/Sets (scope, types, mutability, visibility, uninitialized tracking)
2. **Compiler**: `compile()/execute()` (src/main/ts/compiler/compiler.ts)
   - Multi-pass string transformer: parse → validate → transform → strip syntax → hoist vars → literals → rewrites → wrap IIFE
   - Compiles Tuff → JavaScript IIFE, then `eval`

**Key invariant**: Everything evaluates to `number` (booleans → `1`/`0`; empty input → `0`).

### Making Changes Safely

When adding/modifying language features, you typically need to update **both** execution paths:

- **Interpreter**: Update handler chain in `interpretWithScope()` (src/main/ts/core/app.ts)
- **Compiler**: Update multi-pass pipeline in `createTuffCompiler().compile()` (src/main/ts/compiler/compiler.ts)

Preserve existing patterns: interpreter state via Map/Set parameters; compiler string-scanning (not regex).

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
- See src/main/ts/parser.ts and src/main/ts/compiler/parsing/string-helpers.ts for examples

## Repository Layout

Tuff follows a Gradle-like layout:

- Production code: `src/main/ts/`
- Tests: `src/test/ts/`

Update imports and scripts accordingly when moving files.

### Error Handling

- Throw errors with descriptive messages (no silent failures)
- Use `try/catch` for runtime validation; validation errors are explicit
- Catch-error patterns must name the error (no `_` for caught values)

## Commands

### Testing

- `bun test` – run all tests
- `bun test src/test/ts/path/to/file.test.ts` – run single test file
- **Prefer `itBoth()`**: tests interpreter + compiler together (see src/test/ts/test-helpers.ts)
- Use `itAllBoth()` for multi-module tests (with `use` statements, `extern`, etc.)
- Use `itInterpreter()` only for features without compiler support yet

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

All checks run automatically (see .husky/pre-commit):

- Tests: `bun test`
- Inline check: `bun ./tools/inline-check.ts --git-files-only`
- Copy/paste detection: `npm run cpd`
- Format: `bun run format`
- Lint: `bun run lint:fix`
- Circular dependencies: `bun run check:circular`
- Directory structure: `bun run check:structure`
- Subdirectory dependencies: `bun run check:subdir-deps`
- Dependency graph: `npm run visualize`

**Note**: CPD requires Java 21 (see package.json for JAVA_HOME setup).

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
