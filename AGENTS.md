# Tuff Compiler

A compiler that translates Tuff source code to JavaScript, running on **Bun**.

## Commands

| Task | Command |
|------|---------|
| Install deps | `bun install` |
| Run | `bun run index.ts` |
| Test | `bun test` |

## Architecture

Single-file compiler in **`index.ts`**. Export `compileTuffToJS(tuffSource: string): string` translates Tuff to JS.

- **Tokenizer** (`tokenize`) — Produces `Token[]` (Number, Identifier, operators, punctuation, Eof).
- **Parser chain** — `parseStatements` → `parseExpression` → `parseAddition` → `parseMultiplication` → `parsePrimary`.
- **Features**: integer literals, arithmetic (`+`, `-`, `*`, `/` with `Math.trunc`), parenthesized and braced blocks `{ }`, `let` declarations with shadowing.
- **`parseStatementsInScope`** — Handles `let` bindings and expressions, wraps declarations in IIFEs.
- **`index.test.ts`** — Tests. Helper `executeTuff()` compiles then runs generated JS via `new Function()`.

## Conventions

- ESM modules (`"type": "module"`), TypeScript with `"module": "Preserve"`
- Tests use `bun:test` (`test`, `expect`)
- Tuff programs are prefixed with `PRELUDE` (`in let args : &[&Str]; `) before compilation
