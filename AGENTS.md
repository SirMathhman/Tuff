# Tuff — Agent Instructions

## Project

**Tuff** is a compiler that translates `.tuff` source files to JavaScript. The project is in early development — the compiler is currently a stub.

## Commands

| Command | Purpose |
|---------|---------|
| `bun install` | Install dependencies |
| `bun test` | Run all tests |
| `bun run watch` | Watch mode (nodemon — rebuilds on `.js` / `.tuff` changes) |

## Architecture

```
src/
├── main/js/      — Compiler implementation (ESM)
├── main/tuff/    — Tuff source files
└── test/js/      — Tests (bun:test)
```

- **Entry point**: `src/main/js/index.js` reads `lib.tuff`, compiles, writes `dist/lib.js`.
- **Compiler**: `src/main/js/compile.js` exports `compile(source: string): string`.
- **Generated code contract**: Compiled output is a JS string executed via `Function("__args__", code)(args)` and must return an exit code (number).

## Conventions

- **Runtime**: Bun (not Node.js). Tests use `bun:test`.
- **Modules**: ESM (`"type": "module"`). No CommonJS.
- **Language**: JavaScript files (`.js`) despite `tsconfig.json` being present — TypeScript config is IDE-only (`noEmit: true`).
- **Test helpers**: `expectValid(source, args, expectedExitCode)` and `expectInvalid(source)` in `compile.test.js`.

## Pitfalls

- **ASI on `return`**: Never emit a newline between `return` and its expression in generated code — ASI will insert a semicolon, causing `undefined` returns.
- **Parser queues**: If lowering syntax to queued statements, EOF loops must drain the queue or trailing declarations are silently dropped.
- **No linter**: The project has no ESLint or Prettier config. Follow existing style.
