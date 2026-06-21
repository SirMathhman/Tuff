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
2. **Parser State** (`parser_state.js`) — shared mutable `tokens`/`pos` cursor; exports `parseBraceIdentList`, `parseBraceBlock`, `parseYieldOrReturn` helpers used across parser modules.
3. **Expression Parser** (`expr_parser.js`) — recursive descent for expressions (comparison → add/sub → primary); also contains `_parseInlineStatement` for block-embedded statements.
4. **Control Flow Parser** (`control_flow_parser.js`) — `if/while/for` parsing; takes a `parseItem` callback for branch body recursion.
5. **Statement Parser** (`statement_parser.js`) — top-level statement dispatch + `validateRefs` for variable scope validation.
6. **Parser Facade** (`parser.js`) — re-exports from split modules for backward compatibility.
7. **Code Emitter** (`emitter.js`) — generates JavaScript strings via `emitExpr`; last non-block statement is wrapped in `return`. Uses module-level ref tracking sets initialized by `init()`. `fn_return` and `yield` use `throw {__tuffReturn: true, ...}` to escape IIFE boundaries.
8. **Orchestrator** (`index.js`) — exports `compileTuffToJS`, `compileAllTuffToJSBundled`, `compileAllTuffWithExtern`. Coordinates tokenization → parsing → validation → emission. Supports destructuring (`let { x, y } = expr`) and extern imports.

## Tuff Language Features

- **Variables:** `let x = expr` (immutable), `let mut x = expr` (mutable)
- **I/O:** `read()` parses int from input tokens; `readBool()` reads "true"/"false"
- **Control flow:** `if/else`, `while`, `for (i in start..end)` range loops
- **Functions:** `fn name(params) => body`; exported via `out fn` for cross-module use
- **Arrays:** `[a, b]` literals, index access `arr[i]`, mutation via `let mut`
- **References:** `&x` (immutable ref), `&mut x` (mutable ref), dereference with `*y`
- **Objects:** `{ key : value }` literals, property access `obj.key`
- **Modules:** `out let / out fn` exports; cross-module refs via `module::name`; bundled via `compileAllTuffToJSBundled(sourcesMap, entryPoint)`

## Conventions & Pitfalls

- Generated JS uses string concatenation (template literals). **ASI gotcha:** never put a newline after `return` in generated code — it becomes `return;` due to Automatic Semicolon Insertion.
- Tests use Jest (`jest`). The helper `executeTuff(source, stdIn)` compiles then runs via `new Function`. **Do not modify this helper.**
- Empty/whitespace input should compile to `"return 0;"`.
- Coverage threshold is 90% (see `package.json` jest config).
- If ESLint complains about a file being too long (`max-lines` rule), you MUST split the file into smaller modules. **Do not** remove blank lines or comments to reduce the line count — ESLint ignores these when counting, so this won't help and will hurt readability. Max is 500 non-blank/non-comment lines per file.
- Parser queue gotcha: if parser emits queued statements (syntax-lowering), EOF loops must drain the queue (`while !eof || queue.length>0`) or trailing lowered declarations are silently dropped.
- `fn_return` and `yield` in generated JS use `throw {__tuffReturn: true, value: ...}` to escape IIFE boundaries — do not change this mechanism without updating all catch handlers.
- Parser modules share mutable state via `parser_state.js` (`_tokens`, `_pos`). Be careful when modifying parser logic — changes may affect both top-level and block-expression parsing paths.

## Documentation

See [`docs/MISSING_FEATURES.md`](./docs/MISSING_FEATURES.md) for tracked gaps in language features, ordered by impact.
