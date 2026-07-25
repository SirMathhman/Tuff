# AGENTS.md

## Quick Start

```bash
bun install
bun run start    # Compile src/main/tuff/lib.tuff → src/main/generated-ts/lib.ts
bun run test     # All tests with coverage
bun run lint     # format → typecheck → lint+fix (run in this order)
```

## Architecture

4-stage compiler: `tokenize() → parse() → analyzeSemantics() → generateCode()`. Entry point is `src/main/ts/index.ts`. Pipeline orchestrator is `compileTuffToTS()` in `src/main/ts/compile.ts`.

Each stage returns `Result<T, CompileError>` and short-circuits on first error. **No throws anywhere** — errors propagate through the Result type.

## Critical Gotchas

- **No template literals** — ESLint `no-restricted-syntax` forbids them. Use `+` concatenation.
- **`<` / `>` are `LBRACKET` / `RBRACKET`** — Generic syntax (`Point<I32>`) uses bracket tokens, not `LT`/`GT`.
- **Token column is post-consumption** — `token.column` points to the character _after_ the token, not its start.
- **Empty source** — `compileTuffToTS("")` returns `{ isOk: true, value: "process.exit(0)" }`.
- **Generated code is ESLint-ignored** — Never edit `src/main/generated-ts/` directly.
- **Bool literals require annotation** — `true`/`false` need `: Bool` type annotation; cannot be inferred.
- **Parser is single-pass** — No backtracking. `pos` only advances forward.

## Testing

Tests live in `src/test/ts/`. Helpers in `test-helpers.ts`:

- `expectValid(source, args, expectedExitCode)` — Compiles, transpiles via `Bun.Transpiler`, executes with mocked `process.exit()`, asserts exit code.
- `expectInvalid(source)` — Asserts compilation fails.

Single file: `bun run test -- src/test/ts/compile.test.ts`

## Conventions

- ESM only. TypeScript: `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `module: "Preserve"`.
- ESLint limits: complexity ≤ 10, file ≤ 500 lines, function ≤ 50 lines (excluding comments/blanks).
- Conventional commits: `feat:`, `fix:`, `refactor:`, etc.

## Pre-commit

`.github/hooks/hooks.json` Stop hook: tests → CPD → lint → circular → visualize. All must pass.
