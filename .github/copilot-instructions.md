# Copilot Instructions for Tuff

## Project Overview

**Tuff** is a language interpreter/compiler framework in TypeScript. The project implements a custom language that can be compiled to JavaScript and interpreted at runtime, with a REPL interface for interactive evaluation.

### Architecture

The project has a simple three-layer architecture:

1. **Compile** (`compile()`) - Transforms source code (currently a stub that returns input as-is)
2. **Interpret** (`interpret()`) - Calls compile, then evaluates the resulting JavaScript
3. **REPL** (`startRepl()`) - Interactive command-line interface for executing interpret on user input

The execution model uses JavaScript's `Function` constructor for dynamic evaluation—this is intentional but carries security implications for untrusted code.

## Developer Workflows

### Building & Running

- `npm run build` - Compile TypeScript to `dist/` using tsc (no watch mode configured)
- `npm start` - Build and launch the REPL immediately
- Output directory: `dist/` (configured in tsconfig.json)

### Testing

- `npm test` - Run Jest suite (files in `tests/` matched with `*.test.ts`)
- `npm test:watch` - Watch mode for active development
- Jest configured to transform TypeScript via ts-jest; test globals (`test`, `expect`) are available without imports

### Code Quality

- `npm run lint` - Runs both type checking and linting (must pass both)
  - `npm run lint:tsc` - Type check without emitting
  - `npm run lint:eslint` - ESLint on `src/` and `tests/`

## Project Conventions & Patterns

### TypeScript Configuration

- **Strict mode enabled** - All implicit `any` must be addressed; unused vars not prefixed with `_` are errors
- **Target: ES2019** - Use const/let, arrow functions, async/await; no experimental features
- **CommonJS module system** - Add `declare const require: any` when accessing require (as shown in src/index.ts around line 48)

### ESLint Rules (Project-Specific Relaxations)

- `no-console` is **off** - Logging to console is expected (especially in REPL)
- Unused vars starting with `_` are ignored (convention for intentionally unused parameters)
- `@typescript-eslint/no-explicit-any` is **warn** (not error) - Use sparingly with `eslint-disable-next-line` comments for dynamic code

### Test Patterns

- Tests directly import and call functions under test—no mocking framework configured yet
- Return values are coerced: `interpret()` always returns a `number`, so test expectations use `.toBe(expectedNumber)`
- Use `Number.isNaN()` to verify non-numeric outputs (not truthiness checks on `NaN`)
- See tests/index.test.ts for examples

### Runtime Patterns

- **REPL exit**: Accepts `.exit` or `.quit` commands; empty lines are skipped
- **Error handling**: Errors are caught and logged; REPL continues operating
- **Function constructor usage**: Code uses `new Function(bundledJs)` for evaluation—this is a known security boundary (comment in source documents tradeoff)

## Key Implementation Details

### The `interpret()` Function

Applies numeric coercion to all results: `Number(result)`. This means:

- `interpret("return 42;")` → `42`
- `interpret("return 'text';")` → `NaN` (intentional behavior)
- Implementation in src/index.ts

### The `compile()` Function (TODO)

Currently a stub—accepts any string and returns it unchanged. Future implementations should transform source code to valid JavaScript.

### Node Globals In Tests

ESLint config explicitly declares Jest globals (`test`, `expect`, `describe`, `it`) so they don't require imports in test files.

## File References

- **Core logic:** src/index.ts (contains compile, interpret, startRepl)
- **Test suite:** tests/index.test.ts
- **TypeScript config:** tsconfig.json (strict: true, ES2019 target)
- **ESLint config:** eslint.config.js (flat config format; separate configs for src/ and tests/)
- **Jest config:** jest.config.js
