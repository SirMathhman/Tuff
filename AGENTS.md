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

- **Modular**: Code split across `src/` — `types.ts` (shared types), `tokenize.ts` (tokenizer), `parse.ts` (recursive descent parser), `evaluate.ts` (evaluator). `index.ts` re-exports the public `evaluate` function.
- **Pipeline**: `tokenize(source) → parseProgram(tokens) → evalAst(ast, scope)` exposed via the exported `evaluate(source: string): number` function.
- **Parser**: Recursive descent with explicit precedence levels — `parseExpression` (+/-), `parseTerm` (*/), `parseFactor` (literals, identifiers, parens, blocks). Assignment (`=`) is handled at a lower precedence in `parseAssignmentExpr`.
- **Evaluator**: Walks the AST over a **linked scope chain** (`ScopeFrame` with `locals` Map + `parent` pointer). Variable lookup traverses current → parent → ... → global. Block entry creates a child frame; block exit simply discards it. `let` declares in the current frame; `mut` assignment walks the chain to find and mutate the owning frame.

## Conventions & Pitfalls

1. **ASI warning** (from user memory): Never generate code with a newline after `return` — Bun/JS will insert a semicolon, causing unexpected `undefined`.
2. **Parser queue gotcha**: If the parser ever emits queued statements (syntax-lowering), EOF loops must drain the queue or trailing declarations are silently dropped.
3. **Integer division**: `/` uses `Math.trunc`, not floating-point — tests expect integer results.
4. **Block scoping**: Variables declared with `let` inside a `{ }` block are scoped to that block — they're removed from scope when the block exits. Top-level declarations remain in the global scope. Shadowing is still allowed within nested blocks.
