# Copilot Instructions for Tuff

## What this repo is

Tuff is a TypeScript interpreter for a small expression language: typed integer literals (e.g. `100U8`), statements (`let`, assignment), blocks (`{ ... }`), structs, functions, loops, `match`, comparisons, and boolean logic (`true`/`false` as 1/0).

## Where to start (architecture map)

- Public API: `interpret(input: string): Result<number>` in `src/interpret.ts`.
- Statement execution + scoping: `src/statements.ts` (`processTopLevelStatements` → `processStatements`).
- Expression evaluation: `src/evaluator.ts` (`interpretInternal`, `evaluateBinaryOp`).
- Parsing primitives:
  - Operators/precedence: `src/parser.ts` (`findOperator`) + `src/types.ts` (`getOperatorPrecedence`, operator checks).
  - Literals/primary expressions: `src/literal-parser.ts` (`parseLiteral`: variables, typed numbers, `{...}` expr blocks, `if/else`, `match`, calls/field access).
- Language features live in focused modules: `src/functions.ts`, `src/function-call-utils.ts`, `src/structs.ts`, `src/loops.ts`, `src/assignments.ts`, `src/field-access.ts`, `src/call-expressions.ts`.

## Project-specific conventions you must follow

- All fallible operations return `Result<T>` (`src/result.ts`). Bubble errors immediately.
- Control-flow inside blocks uses markers:
  - `yield <expr>;` becomes `__YIELD__:<expr>:__` in `src/statements.ts` and is evaluated in `src/literal-parser.ts`.
  - `return <expr>;` becomes `__RETURN__:<expr>:__` and triggers a `ReturnSignal` (`src/function-call-utils.ts`). `src/interpret.ts` rejects returns at top level.
- Block scoping rule: inner `let` bindings don’t leak; only mutations to existing outer variables propagate (see `createScopedContext` in `src/statements.ts`).
- “Global” definitions (`struct`, `fn`) register globally and intentionally do not update the local `ExecutionContext` (see `isGlobalDefinition` in `src/statements.ts`).

## Workflows (what to run)

- Tests: `pnpm test` (watch: `pnpm test:watch`, coverage: `pnpm test:coverage`). Tests live in `tests/interpret.test.ts` and typically assert via `Result` exhaustively.
- Lint/format: `pnpm lint` and always prefer `pnpm lint:fix` when formatting fights you.
- Duplication gate: `pnpm cpd` (PMD CPD, 50 tokens).
- Husky runs checks on commit; leave the repo with a clean commit when you change behavior.A

## Debugging strategy: Hypothesis-driven approach

When encountering a problem, avoid diving straight into code reading. Instead, use objective feedback to narrow down the issue:

1. **Encounter a problem**: Identify the failing behavior (test failure, unexpected output, etc.).
2. **Form a testable hypothesis**: Create a specific hypothesis about what's causing the issue (e.g., "variable scoping is leaking outer context" or "operator precedence is wrong for this case").
3. **Make a test of the hypothesis**: Write a minimal test case or query that directly tests the hypothesis.
4. **Run the test**: Execute the test to see if your hypothesis is correct.
5. **Iterate or implement**:
   - If the hypothesis is **disproven**: Form a new hypothesis and repeat steps 2–4.
   - If the hypothesis is **confirmed**: Gather additional tests if needed, then implement the fix with confidence.

This is often more effective than reading code because you get objective feedback on actual behavior rather than inferring it. Each test iteration narrows the problem space dramatically.

## ESLint constraints that shape code structure

Tabs, no regex literals, no ternaries, no `null`, very strict TS rules, and tight complexity limits (notably `max-depth: 2`, `max-lines-per-function: 50`, `max-lines: 500` skipping blanks/comments). If a file grows, extract a new module rather than “formatting it smaller”.
