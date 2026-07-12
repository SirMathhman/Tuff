# Tuff Compiler (tuffc) — Agent Instructions

## Quick Start

| Task                 | Command                                                                                                           |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Run tests + coverage | `bun test --coverage`                                                                                             |
| Lint & auto-fix      | `eslint . --fix`                                                                                                  |
| Check duplication    | `pmd cpd index.js index.test.js --minimum-tokens 50 --language ecmascript --ignore-literals --ignore-identifiers` |

## Architecture

`tuffc` is a single-file JavaScript compiler for the **Tuff** language — a minimal expression-based, typed language. The source file `index.js` exports one function: `compile(source)` which transforms Tuff source into executable JS strings (evaluated via `new Function`).

### Compilation Pipeline (`compile()`)

1. **Resolve type aliases** — expands `type Temp = I32` and generic `type Wrapper<T> = T` declarations
2. **Validate literals** — checks numeric suffixes like `100U8` against range bounds
3. **Check narrowing conversions** — rejects assigning wider reads to narrower variables
4. **Strip type annotations & suffixes** — removes compile-time-only syntax (`: U8`, `<U8>`, etc.)
5. **Process blocks** — converts `{ ... }` into IIFEs when they contain statements, otherwise parenthesizes expressions
6. **Extract function declarations** — separates `fn name() => body;` from remaining parts
7. **Check mutability** — enforces immutable-by-default variables (`let x`) vs mutable (`let mut x`)
8. **Build output** — wraps everything with a token iterator and returns the final JS string

### Key Conventions

- Functions are capped at **50 lines** (ESLint `max-lines-per-function`). Extract helpers when approaching this limit.
- Max nesting depth is **2 levels** (`max-depth: 2`). Flatten deeply nested logic.
- No code duplication — PMD CPD runs with a minimum of 50 tokens. Refactor repeated patterns into shared functions.

### Testing Pattern

Tests in `index.test.js` use two helpers:

- `expectValid(source, stdIn, expectedExitCode)` — compiles and executes via `new Function("stdIn", generated)(stdIn)`
- `expectInvalid(source)` — asserts that `compile()` throws
