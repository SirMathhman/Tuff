---
description: Tuff compiler project conventions and agent guidance
---

# Tuff Compiler

A single-file compiler that translates "Tuff" language source to JavaScript. The generated JS reads from `stdIn` (whitespace-separated tokens) via an internal index (`ri`).

## Commands

| Command        | Description                            |
| -------------- | -------------------------------------- |
| `npm test`     | Run tests (Bun test runner)            |
| `npm run lint` | Lint with ESLint                       |
| `npm run cpd`  | Check for copy-paste duplication (PMD) |

## Architecture (`index.js`)

1. **Tokenizer** — scans source into tokens (keywords, identifiers, numbers, operators, parens, braces, semicolons, function calls).
2. **Parser** — recursive descent parser builds an AST from tokens.
3. **Validator** — walks AST to check variable declarations and mutability before code emission.
4. **Code Emitter** — generates JavaScript strings; last non-block statement is wrapped in `return`.

## Conventions & Pitfalls

- Generated JS uses string concatenation (template literals). Watch for [ASI gotchas](memories/debugging.md) — never put a newline after `return` in generated code.
- Tests use Bun's native test framework (`bun:test`). The helper `executeTuff(source, stdIn)` compiles then runs via `new Function`. **Do not modify this helper.**
- Empty/whitespace input should compile to `"return 0;"`.
- Coverage threshold is 90% (see `bunfig.toml`).
- If ESLint complains about a file being too long (`max-lines` rule), you MUST split the file into smaller modules. **Do not** remove blank lines or comments to reduce the line count — ESLint ignores these when counting, so this won't help and will hurt readability.
