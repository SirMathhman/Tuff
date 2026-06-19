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
2. **Parser** (`parser.js`) — recursive descent parser builds an AST from tokens; uses module-level `tokens`/`pos` state; also provides `validateRefs` for variable validation.
3. **Code Emitter** (`emitter.js`) — generates JavaScript strings via `emitExpr`; last non-block statement is wrapped in `return`. Uses module-level ref tracking sets initialized by `init()`.
4. **Orchestrator** (`index.js`) — exports `compileTuffToJS` (single file) and `compileAllTuffToJSBundled` (multi-module). Coordinates tokenization → parsing → validation (collects declared/mutable vars, ref targets) → emission.

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
- If ESLint complains about a file being too long (`max-lines` rule), you MUST split the file into smaller modules. **Do not** remove blank lines or comments to reduce the line count — ESLint ignores these when counting, so this won't help and will hurt readability.
- Parser queue gotcha: if parser emits queued statements (syntax-lowering), EOF loops must drain the queue (`while !eof || queue.length>0`) or trailing lowered declarations are silently dropped.
