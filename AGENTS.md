# Tuff Compiler

A compiler that translates Tuff source code to JavaScript, running on **Bun**.

## Commands

| Task | Command |
|------|---------|
| Install deps | `bun install` |
| Run | `bun run index.ts` |
| Test | `bun test` |

## Architecture

- **`index.ts`** — Core compiler. Export `compileTuffToJS(tuffSource: string): string` translates Tuff to JS.
  - Parser chain: `parseExpression` → `parseAddition` → `parseNumber`. Currently supports integer literals and `+` (addition) only.
  - Extracts the expression after the last `;` in the source.
- **`index.test.ts`** — Tests. Helper `executeTuff()` compiles then runs generated JS via `new Function()`.

## Conventions

- ESM modules (`"type": "module"`), TypeScript with `"module": "Preserve"`
- Tests use `bun:test` (`test`, `expect`)
- Tuff programs are prefixed with `PRELUDE` (`in let args : &[&Str]; `) before compilation
