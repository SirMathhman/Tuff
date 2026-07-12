# Tuff — Agent Instructions

A minimalist compiler that transforms a custom DSL into executable JavaScript.

## Quick Start

```bash
pnpm install
npm run test    # Run tests (Bun)
npm run lint    # Lint with --fix
npm run cpd     # Check for code duplication
```

## Architecture

- **`index.js`** — Single-file compiler exposing `compile(source)` which validates and transforms DSL source to JS.
- **`index.test.js`** — Tests using Bun's built-in test runner (`bun:test`). Test helper `expectValid()` executes generated code via `new Function()`.

## DSL Overview

The language supports:
- `read()` / `read<T>()` — consume sequential tokens from stdin (parsed as integers)
- `let x = expr;` — variable declarations
- `{ ... }` — block expressions (statement blocks become IIFEs, expression-only blocks become grouped expressions)
- Arithmetic operators and multi-character identifiers
- Typed number literals: `100U8`, `50I16`, etc. (validated against type range, then stripped)

## Conventions

- **No regex literals or `RegExp` constructor** — ESLint rule enforces this; use string iteration instead.
- **Max nesting depth: 2** — enforced by ESLint.
- **CommonJS modules** with named exports (`export function compile`).
- **Test pattern:** `expectValid(source, stdIn, expectedExitCode)` for happy paths, `expectInvalid(source)` for validation errors. Generated code is executed at runtime via `new Function("stdIn", generated)(stdIn)`.

## Gotchas

- See `/memories/` (user memory) for ASI pitfalls with dynamically generated JS and parser queue draining patterns.
- Pre-commit hooks run test → lint → cpd; all must pass before commit succeeds (`.github/hooks/hooks.json`).
