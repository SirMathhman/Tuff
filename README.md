# Tuff

A small TypeScript interpreter project.

## Dev

- Install deps with pnpm
- Run tests with `pnpm test`
- Run lint with `pnpm lint`
- Run code duplication check with `pnpm cpd`
- Run all checks with `pnpm check`

Lint note: ESLint enforces a max cyclomatic complexity of 50 per function.

## Architecture

The codebase is organized into focused modules under 500 lines each:

- `src/eval/` - Expression evaluation modules:
  - `operators.ts` - Binary operator application
  - `functions.ts` - Function call handling
  - `call_evaluator.ts` - Call evaluation context
  - `operand_resolvers.ts` - Operand resolution (address-of, deref, etc.)
  - `tokenizer.ts` - Expression tokenization
- `src/interpret/` - Statement interpretation modules:
  - `statements.ts` - Main statement interpreter
  - `loop_handlers.ts` - While/for loop handlers
  - `if_handlers.ts` - If statement handler
  - `extern_handlers.ts` - Extern declaration handlers
  - `assignment_handlers.ts` - Assignment statement handlers
  - `helpers.ts` - Shared helper functions
  - `annotations.ts` - Type annotation parsing
  - `arrays.ts` - Array-related utilities
  - `parsing.ts` - Statement parsing utilities

## Notes

- Block expressions (`{ ... }`) are lexically scoped: declarations inside a braced block do not leak outward.
- Constructor-style functions that return `this` expose any nested `fn` declarations as methods (e.g., `Point(3, 4).manhattan()`).
- The codebase avoids explicit TypeScript `any` (prefer `unknown` + narrowing/type guards) and avoids `Record<...>` types (prefer `Map`).
- No ESLint suppressions are used - all files conform to max-lines (500) and no-restricted-syntax rules.
