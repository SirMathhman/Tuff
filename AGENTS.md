# Tuff — AI Agent Instructions

## Project Overview

Tuff is a minimal programming language interpreter written in TypeScript, built with Bun. The entire runtime lives in `index.ts` as a single-file pipeline: **tokenize → parse (recursive descent) → evaluate**.

The interpreted language supports integers, binary ops (`+`, `-`, `*`, `/`), `let` / `mut` variable declarations, assignment expressions (`x = ...`), blocks `{ }`, and parenthesized groups `( )`. Division uses integer truncation (`Math.trunc`).

## Commands

| Command          | Description                      |
| ---------------- | -------------------------------- |
| `bun test`       | Run tests (Bun built-in runner)  |
| `bun run lint`   | Type-check with `tsc --noEmit`   |
| `bun run cpd`    | PMD copy-paste duplication check |
| `bun run format` | Prettier auto-format             |

## Architecture

- **Single-file**: All code in `index.ts`. Tests in `index.test.ts`. No build step — Bun runs TypeScript directly.
- **Pipeline**: `tokenize(source) → parseProgram(tokens) → evalAst(ast, scope)` exposed via the exported `evaluate(source: string): number` function.
- **Parser**: Recursive descent with explicit precedence levels — `parseExpression` (+/-), `parseTerm` (*/), `parseFactor` (literals, identifiers, parens, blocks). Assignment (`=`) is handled at a lower precedence in `parseAssignmentExpr`.
- **Evaluator**: Walks the AST over a flat `Map<string, { value, mutable }>` scope. Variable shadowing is allowed; redeclaration replaces the entry.

## Conventions & Pitfalls

1. **ASI warning** (from user memory): Never generate code with a newline after `return` — Bun/JS will insert a semicolon, causing unexpected `undefined`.
2. **Parser queue gotcha**: If the parser ever emits queued statements (syntax-lowering), EOF loops must drain the queue or trailing declarations are silently dropped.
3. **Integer division**: `/` uses `Math.trunc`, not floating-point — tests expect integer results.
4. **Scope is flat** (no block scoping for inner `{ }` yet) — current tests confirm shadowing works but inner blocks don't create new scope frames. Be careful when adding true lexical scoping.
