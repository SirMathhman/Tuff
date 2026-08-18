# Tuff — Target Architecture

This document describes the ideal, industry-standard architecture for the Tuff
compiler as it scales. It is a north star, not a description of the current code.

## Pipeline

A familiar compiler pipeline, each stage a small, isolated module:

```
source text
   │
   ▼
lexer      → tokens (src/lexer.ts)
   │
   ▼
parser     → AST (src/parser.ts)
   │
   ▼
evaluator  → value (src/evaluator.ts)
```

- `src/index.ts` is the public entry point only: it composes the stages and
  exports the public API. It should stay thin.
- Each stage lives in its own file, depends only on the types of the stage
  before it, and never reaches past it. This keeps the dependency graph a
  simple chain (verifiable with `pnpm madge:circular`) and makes each stage
  independently testable.
- The AST is a plain, serializable data structure (discriminated union of node
  types) defined in `src/ast.ts`, shared by parser and evaluator.

## Errors

- No exceptions. Every fallible function returns a Result:
  `{ ok: true; value: T } | { ok: false; error: E }`.
- Errors are structured (discriminated union / enum-like), not bare strings.
  Each error answers: what happened, where (source position), why it is an
  error, and how to fix it.
- Errors carry source positions (line/column) from the lexer so diagnostics
  can point at the offending input.

## Testing

- One test file per module, mirroring the source layout
  (`src/lexer.test.ts`, `src/parser.test.ts`, ...).
- Table-driven tests for the lexer and parser; property-style tests for the
  evaluator once semantics are defined.

## Conventions

- Files stay small (the linter enforces ≤300 lines per file, ≤50 per function).
- No circular dependencies between modules.
- Pure functions wherever possible; no hidden global state.
