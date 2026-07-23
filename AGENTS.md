# Tuff — Agent Instructions

## Project

**Tuff** is a compiler that translates `.tuff` source files to JavaScript. The project is in early development.

## Commands

| Command          | Purpose                                                    |
| ---------------- | ---------------------------------------------------------- |
| `bun install`    | Install dependencies                                       |
| `bun test`       | Run all tests                                              |
| `bun run watch`  | Watch mode (nodemon — rebuilds on `.js` / `.tuff` changes) |
| `bun run lint`   | Lint (ESLint with `--fix`)                                 |
| `bun run format` | Format (Prettier)                                          |
| `bun run cpd`    | Check for copy-paste duplication (PMD CPD)                 |

## Architecture

```
src/
├── main/js/      — Compiler implementation (ESM)
├── main/tuff/    — Tuff source files
└── test/js/      — Tests (bun:test)
```

- **Entry point**: `src/main/js/index.js` reads `src/main/tuff/lib.tuff`, compiles, writes `dist/lib.js`.
- **Compiler**: `src/main/js/compile.js` exports `compile(source: string)` → `{ ok: true, value: string } | { ok: false, error: string }`.
- **Compiler pipeline**: Tokenizer → Parser → AST → Code Generator.
- **Generated code contract**: Compiled output is a JS string executed via `Function("__args__", code)(args)` and must return an exit code (number).

## Conventions

- **Runtime**: Bun (not Node.js). Tests use `bun:test`.
- **Modules**: ESM (`"type": "module"`). No CommonJS.
- **Test helpers**: `expectValid(source, args, expectedExitCode)` and `expectInvalid(source, expectedError)` in `src/test/js/compile.test.js`.
- **Error handling**: No `throw` statements — use result objects `{ ok, value/error }` instead.
- **No regex**: ESLint forbids `RegexLiteral` — use character tests instead.
- **Stop hooks**: Agent sessions run test, lint, cpd, and format checks on exit (`.github/hooks/hooks.json`).

## Pitfalls

- **ASI on `return`**: Never emit a newline between `return` and its expression in generated code — ASI will insert a semicolon, causing `undefined` returns.
- **Parser queues**: If lowering syntax to queued statements, EOF loops must drain the queue or trailing declarations are silently dropped.
- **Complexity limit**: ESLint enforces `complexity: 10` and `max-lines-per-function: 50`.
