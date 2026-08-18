# Tuff — Target Architecture

This document describes the ideal, industry-standard architecture for the Tuff compiler as it scales. It is a north star, not a description of the current state.

## Layered Structure

```
src/
  index.ts            # Public API surface only: re-exports, version, top-level entry points
  cli/                # Command-line entry: argument parsing, exit codes, I/O (stdin/stdout/files)
  compiler/
    lexer.ts          # Tokenization: source text -> token stream
    parser.ts         # Parsing: tokens -> AST
    ast.ts            # AST node type definitions (discriminated unions)
    evaluator.ts      # AST -> value (or will become: codegen/optimizer passes)
  errors.ts           # Structured error types shared across layers
```

Each layer depends only on the layer below it. No circular dependencies (enforced by `pnpm madge:circular`). Files stay small and single-purpose; split before they grow past a few hundred lines.

## Public API Surface

- `src/index.ts` is the only public entry point. It exposes `evaluate` (and any future top-level entry points) plus re-exports of the shared types (`Result`, `SourcePosition`, `TuffError`).
- Compiler internals (`tokenize`, `parseExpression`, AST types) are implementation details of the `compiler/` layer. They may be exported from their own modules for per-layer testing, but consumers of the package should only depend on `index.ts`.
- Adding a feature (new operator, new delimiter, new error kind) must not require editing more than one layer's file plus `errors.ts` if a new error variant is needed.

## Error Handling

- No thrown exceptions across module boundaries. Fallible operations return a Result:
  `type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }`.
- Errors are structured, not bare strings: a discriminated union (e.g. `LexError | ParseError | EvalError`) carrying:
  - **what** — the error kind and message,
  - **where** — source position (line/column/offset) of the offending input,
  - **why** — the rule or expectation that was violated,
  - **how to fix** — an actionable hint for the user.
- The CLI layer is the only place that converts errors into exit codes and console output.
- **Tokens carry source positions from the lexer.** Every token is produced with its `{ offset, line, column }`, and every downstream error (parse, eval) derives its position from the token that triggered it. This makes "where" answerable at every layer without re-scanning the source.
- The public API (`evaluate` and friends) returns `Result<number, TuffError>`; no public function throws.

## Testing

- One test file per source file, colocated (`foo.ts` / `foo.test.ts`).
- Tests exercise the public API of each module; the compiler is tested end-to-end (source text -> result) as well as per-layer (tokens, AST, value).
- Coverage of error paths is required, not just happy paths.

## Conventions

- ESM with explicit `.js` extensions in relative imports (required by `moduleResolution: NodeNext`).
- `strict` TypeScript; no `any` without justification.
- Lint/typecheck must pass: `pnpm lint:eslint`, `pnpm lint:typecheck`, `pnpm format:prettier`.
