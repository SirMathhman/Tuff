---
description: Tuff compiler project conventions and agent guidance
---

# Tuff Compiler

A single-file compiler that translates "Tuff" language source to JavaScript. The generated JS reads from `stdIn` (whitespace-separated tokens) via an internal index (`ri`).

## Commands

| Command        | Description                            |
| -------------- | -------------------------------------- |
| `npm test`     | Run tests (Jest with coverage)         |
| `npm run lint` | Lint with ESLint                       |
| `npm run cpd`  | Check for copy-paste duplication (PMD) |

## Architecture (`src/`)

1. **Tokenizer** (`tokenizer.js`) — scans source into tokens (keywords, identifiers, numbers, operators, parens, braces, semicolons, function calls).
2. **Parser** (`parser.js`) — recursive descent parser builds an AST from tokens; also provides `validateRefs` for variable validation.
3. **Code Emitter** (`emitter.js`) — generates JavaScript strings via `emitExpr`; last non-block statement is wrapped in `return`.
4. **Orchestrator** (`index.js`) — exports `compileTuffToJS`, coordinates tokenization → parsing → validation (collects declared/mutable vars, ref targets) → emission.

## Conventions & Pitfalls

- Generated JS uses string concatenation (template literals). Watch for [ASI gotchas](memories/debugging.md) — never put a newline after `return` in generated code.
- Tests use Jest (`jest`). The helper `executeTuff(source, stdIn)` compiles then runs via `new Function`. **Do not modify this helper.**
- Empty/whitespace input should compile to `"return 0;"`.
- Coverage threshold is 90% (see `package.json` jest config).
- If ESLint complains about a file being too long (`max-lines` rule), you MUST split the file into smaller modules. **Do not** remove blank lines or comments to reduce the line count — ESLint ignores these when counting, so this won't help and will hurt readability.
