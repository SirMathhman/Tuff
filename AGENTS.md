# Tuff — Agent Instructions

Tuff is a numeric expression evaluator written in TypeScript, run on **Bun**. It parses and evaluates a small language of numbers, arithmetic, `let`-bindings, blocks, and references (`&`/`*`).

Deeper architecture, definitions, and known design issues live in repo memory at `/memories/repo/architecture.md` — read it before making structural changes.

## Commands

| Task                    | Command                                                    |
| ----------------------- | ---------------------------------------------------------- |
| Run tests               | `bun test`                                                 |
| Type-check + lint       | `bun run lint` (runs `tsc --noEmit` then `eslint .`)       |
| Detect circular deps    | `bun run madge:circular`                                   |
| Detect code duplication | `bun run pmd:cpd`                                          |
| Regenerate call graph   | `bun run callgraph` (writes `docs/callgraph.svg` + `.dot`) |

A **Stop hook** (`.github/hooks/hooks.json`) automatically runs `test`, `lint`, `pmd:cpd`, the callgraph, and `madge:circular` and blocks the turn if any fail. Treat all five as a hard gate: your change must keep tests green, type-check, lint clean, free of circular imports, and free of new duplication.

## Architecture

Pipeline: `tokenizer.ts` (input → tokens) → `parser.ts` (tokens → AST) → `evaluator.ts` (AST + Env → value). `ast.ts` holds the AST types and the `OPERATOR_PRECEDENCE` table (the single source of truth for precedence). `statements.ts` holds the shared block/statement parsing helpers. `index.ts` is the public API (`evaluate`).

Dependency direction is strictly one-way: `index.ts` → `parser.ts` / `evaluator.ts`; `parser.ts` → `tokenizer.ts` / `ast.ts` / `statements.ts`; `evaluator.ts` → `ast.ts`. **No cycles.** `tools/` is dev-only and must never be imported by `src/`.

The tokenizer is **context-free** — it emits one token kind per character sequence with no lookaround. Position-ambiguous operators (e.g. `*` as multiplication vs. dereference) are disambiguated by the **parser**, which knows the grammar position. Keep it that way.

## Conventions (enforced by `eslint.config.ts` — do not fight them)

- **Result-style errors, never throw.** `ThrowStatement` is a lint error. Every fallible function returns a `{ ok: true, value } | { ok: false, error }` union. The public `evaluate` returns `EvalResult`; failures are structured `EvalError`s (what/where/why), never exceptions.
- **No classes.** `ClassDeclaration` is a lint error — use plain functions and interfaces.
- **No anonymous type literals.** `TSTypeLiteral` is a lint error — always use a named `interface`.
- **JSDoc is mandatory** on every function declaration, method, class expression, and on all `interface` / `type` / `enum` declarations (including each member). `@param` and `@returns` with descriptions are required.
- **Size limits:** ≤ 300 lines per file, ≤ 50 lines per function (blank/comment lines excluded). Split before you exceed them.
- **No dynamic code execution:** `no-eval` and `no-new-func` are errors.
- **Type-only imports use `import type`** (`verbatimModuleSyntax` is on). **Relative imports include the `.ts` extension** (`allowImportingTsExtensions` is on).

## Testing

- Tests live beside the code as `*.test.ts` and use `bun:test` (`import { expect, test } from "bun:test"`).
- **Test the real modules — never `mock.module` the module under test.**
- The public surface is `evaluate`; most tests drive it end-to-end. Follow the existing naming style: `test('evaluate("<input>") => <expected>', ...)`.
- Cover both success and the structured-error paths (each `EvalError.kind` has at least one test).

## Known pitfalls (see repo memory for detail)

- `mut` is a **soft keyword**: the tokenizer emits `kw-mut` for the identifier `mut` everywhere, but the parser only accepts it in `let`-binding position, so `mut` cannot be a variable name. Don't "fix" this casually — it's a known design decision.
- Precedence **levels** are hand-wired: `parseTerm` / `parseAddSub` / `parseExpr` each hardcode one level and pass the next-tighter parser to `parseBinaryLevel`. Adding a new level means a new parse function + call-site, not just a table entry.
- `ParseError` (in `statements.ts`) and `EvalError` (in `index.ts`) are structurally identical but defined twice — keep them in sync if you add a field.
- References are **name-based (lexical)**: `&x` stores the name and `*y` resolves it in the _current_ environment, so a shadowing binding changes what a reference resolves to.
- Evaluator (runtime) errors carry **no position** — only parse errors do.
