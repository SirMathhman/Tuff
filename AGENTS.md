# Tuff — Agent Instructions

A compiler that translates Tuff source code to JavaScript.

## Project Setup

```bash
bun install
```

## Commands

| Task         | Command                  |
|---------------|--------------------------|
| Run           | `bun run index.ts`       |
| Tests         | `bun test`               |
| Type Check    | `tsc --noEmit`           |

## Architecture

- **`index.ts`** — Core compiler. Export `compileTuffToJS(tuffSource: string): Result<string, CompileError>` returns generated JS or a compile error.
- **`index.test.ts`** — Tests that compile Tuff source, execute the generated JS in a sandbox, and verify exit codes.

## Conventions

- Use `Result<T, X>` (Ok/Err) pattern for fallible operations — no exceptions for control flow.
- ESNext target, ESM modules, strict TypeScript with `verbatimModuleSyntax`.
- Tests mock `process.exit()` and evaluate generated JS with `new Function()`.
