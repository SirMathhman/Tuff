# Tuff Compiler — Agent Instructions

## Project Overview

`tuffc` is a compiler that transpiles `.tuff` source files to JavaScript. The pipeline is: **tokenize → parse → validate identifiers → generate JS**.

## Commands

| Command         | Description                                          |
| --------------- | ---------------------------------------------------- |
| `npm start`     | Run compiler (`main.tuff` → `main.js`)               |
| `npm test`      | Run Jest test suite                                  |
| `npm run watch` | Watch mode — auto-recompile on `.js`/`.tuff` changes |
| `npm run lint`  | ESLint + circular dependency check (`madge`)         |
| `npm run cpd`   | PMD copy-paste detection                             |

## Architecture

Classic compiler pipeline split across modules in `src/`:

- **`lib.js`** — Orchestrator. Exports `compileTuffToJS(source)` which runs tokenize → parse → validate → generate. Returns `{ variant: "ok", value }` or `{ variant: "err", error }`.
- **`tokenizer.js`** — Lexer. Produces position-aware tokens (`{ type, value, line, col }`). Exports `TokenType` enum and `tokenize(source)`.
- **`parser.js`** — Recursive descent parser. Builds AST from tokens. Exports `NodeType` enum and `parse(tokens)`.
- **`codegen.js`** — Code generator. Transforms AST → JavaScript source string. Exports `generate(ast)`.
- **`index.js`** — CLI entry point. Reads `main.tuff`, calls `compileTuffToJS()`, writes `main.js` with `process.exit()` wrapper.

Tests live in `tests/` (Jest, see `tests/lib.test.js`).

## Conventions

- **ES modules** (`"type": "module"` in `package.json`)
- **Result pattern**: Functions return `{ variant: "ok", value/node }` or `{ variant: "err", error }`. Use `Ok()` / `Err()` helpers from `lib.js`.
- **Position tracking**: Tokens carry 1-based `line` and 0-based `col`; parser errors include line:col location
- **Generated output** (`main.js`) is ignored by ESLint — do not lint it
- **Tests use `new Function("stdIn", code)(input)`** to execute compiled JS in isolation with mocked stdin
