# Tuff Compiler — Agent Instructions

## Project Overview

`tuffc` is a compiler that transpiles `.tuff` source files to JavaScript. The pipeline is: **tokenize → parse → validate identifiers → generate JS**.

The Tuff language supports structs (with generics), type aliases, function declarations with block bodies and return types, extern declarations for native bindings, mutable variables, method calls with receivers, destructuring imports between modules, and a module system with exports. See `tests/lib.test.js` for comprehensive examples of supported syntax.

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

- **`lib.js`** — Orchestrator. Exports:
  - `compileTuffToJS(source)` — single-file compilation, returns `{ variant: "ok", value }` or `{ variant: "err", error }`. Runs tokenize → parse → validate identifiers → generate.
  - `compileModulesToJS(moduleNames, sources)` — multi-module compilation with cross-module exports via `out let`.
  - `compileModulesWithNative(tuffModuleNames, tuffSources, nativeModules)` — like above but also inlines native JS modules (with `export` statement transformation).
  - Internal: `validateIdentifiers(ast, knownIds)` walks the AST ensuring all identifiers are declared builtins (`read`), module names, or locally scoped variables/functions.
- **`tokenizer.js`** — Lexer. Produces position-aware tokens (`{ type, value, line, col }`). Exports `TokenType` enum and `tokenize(source)`. Skips whitespace, block comments (`/* */`), and string literals (captured as single tokens).
- **`parser.js`** — Recursive descent parser. Builds AST from tokens. Exports `NodeType` enum and `parse(tokens)`. Handles generics by skipping `<T>` parameter lists during parsing (type-level info is compile-time only).
- **`codegen.js`** — Code generator. Transforms AST → JavaScript source string. Exports `generate(ast, options)`. Struct declarations and type aliases produce no runtime code. Method receivers (`this`) are renamed to `_self` in generated JS.
- **`index.js`** — CLI entry point. Reads `main.tuff`, calls `compileTuffToJS()`, writes `main.js` wrapped in `process.exit((() => { ... })());`.

Tests live in `tests/` (Jest, see `tests/lib.test.js`).

## Generated JS Runtime

Compiled output uses a `_ctx` object as the execution context:

- Variables are stored on `_ctx` (e.g., `_ctx.x = 1`)
- Module exports go through `_ctx.__exports`, then wiring code copies them to module namespaces
- `stdIn` is available as a global — split into integer tokens by whitespace for `read()` calls
- The entry expression's value becomes the process exit code

## Conventions

- **ES modules** (`"type": "module"` in `package.json`)
- **Result pattern**: Functions return `{ variant: "ok", value/node }` or `{ variant: "err", error }`. Use `Ok()` / `Err()` helpers from `lib.js`.
- **Position tracking**: Tokens carry 1-based `line` and 0-based `col`; parser errors include line:col location
- **Generated output** (`main.js`) is ignored by ESLint — do not lint it
- **Tests use `new Function("stdIn", code)(input)`** to execute compiled JS in isolation with mocked stdin
