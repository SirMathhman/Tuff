# Copilot / AI Agent Instructions for Tuff

Quick, actionable guidance to help an AI coding agent be productive in this repository.

## Project snapshot

- Purpose: a small TypeScript interpreter for a tiny language (parser + evaluator).
- Key areas: tokenization (`src/interpret.ts`), parsing (`src/parser.ts`, `src/expressions.ts`, `src/statements.ts`, `src/functions.ts`, `src/structs.ts`), runtime values & types (`src/types.ts`, `src/typeConformance.ts`), scoping (`src/scopes.ts`), and helpers (`src/assignHelpers.ts`, `src/calls.ts`).

## Tests & developer workflow

- Run tests: `npm test` (Jest). Tests assert exact `Result` shapes ({ ok: true/false, value/error }).
- Lint: `npm run lint` (ESLint configured for TypeScript). Use `npm run lint:fix` for automatic fixes.
- Build: `npm run build` (tsc).
- Duplication checks: `npm run cpd` (PMD CPD) — PMD must be available in PATH.
- Commit hooks: Husky is installed via `prepare` script.

## Where to make changes for common tasks (concrete file pointers)

- Add new token kinds or change tokenization: update the regex in `src/interpret.ts` and add tests in `tests/interpret.test.ts` that exercise tokenization and parsing together.
- Add parsing rules: extend or add parser helpers in `src/expressions.ts`, `src/statements.ts`, or `src/functions.ts`. Keep helpers small and testable — there are existing helpers that follow `ParserLike` interface.
- Add runtime/value kinds: add types to `src/types.ts`, ensure `typeConformance.ts` and `assignHelpers.ts` are updated, and add tests asserting behavior and error messages.
- Add type rules: update `src/typeConformance.ts` and include examples in tests verifying both happy path and precise error messages (tests assert exact `InvalidInput` messages).

## Testing & error message expectations

- Tests compare exact error objects. When introducing new errors or changing messages, update tests accordingly.
- Prefer adding unit tests in `tests/interpret.test.ts` that exercise a short program string via `interpret(...)` and assert the Result.
- When adding features that touch parsing, add small isolated tests that show how invalid inputs fail (e.g., duplicate declarations, unknown type names, arity mismatch).

## Examples to reference when implementing features

- Adding a function: follow `src/functions.ts::parseFunctionDeclaration` which collects parameter names, optional return type, and tokenized body.
- Checking types on assignment: see `src/assignHelpers.ts` + `src/typeConformance.ts` for the exact error shapes and checks used for `I32` and `Bool`.
- Structs: `src/structs.ts` (parsing) and runtime shape: instances are `Map<string, number>`.

## Performance / style notes

- Keep modules small and single-responsibility (project favors many small files).
- Avoid changing public interfaces unless necessary; prefer new helper functions and add tests.

## Integration & external tools

- PMD (for CPD) may be required to run `npm run cpd` locally.
- No runtime dependencies — devDeps are TypeScript, Jest, ESLint, Husky.

## Linting rules (ESLint)

The repository enforces a strict ESLint config in `eslint.config.cjs`. Edit that file to change rules. Key points:

- Files targeted: `**/*.ts` (uses `@typescript-eslint/parser`, ecmaVersion 2021, module sourceType).
- Plugin: `@typescript-eslint/eslint-plugin` (recommended rules are included in the config).

Explicit rules (as configured):

- `complexity: ["error", { max: 15 }]` — functions should not exceed 15 logical branches.
- `@typescript-eslint/consistent-type-definitions: ["error", "interface"]` — prefer `interface` over `type` aliases for object types.
- `max-lines-per-function: ["error", { max: 50, skipComments: true, skipBlankLines: true }]` — keep functions small.
- `max-lines: ["error", { max: 500, skipComments: false, skipBlankLines: true }]` — file length limit encourages small modules.
- `no-restricted-syntax` — several selectors disallowed; messages explain rationale. Notable disallowed patterns:
  - `ThrowStatement`: "Do not use throw; return Result<T, E> instead." (use the `Result` pattern from `src/types.ts`).
  - Assigning function expressions or arrow functions to variables: prefer named function declarations (`function name(...)`) instead.
  - Declaring interfaces inside functions: declare at module scope instead.
  - Chained member access (e.g., `a.b.c` or `a.b().c`) and chained call/member expressions: follow Law of Demeter; prefer helper methods or intermediate variables.
  - `BreakStatement` / `ContinueStatement`: avoid these control-flow constructs; prefer clearer loop conditions or refactor.
  - `TSAsExpression`: prohibit `as` type assertions; prefer explicit types or typed helpers.
  - `null` (both `Literal[value=null]` and `NullLiteral`) — prefer `undefined` over `null`.
  - A specific type-pattern forbids `Result<undefined, ...>` in type annotations; prefer `InterpretError | undefined` where appropriate.
- `@typescript-eslint/no-explicit-any: ["error"]` — disallow `any`.
- `@typescript-eslint/no-restricted-types: ["error", { types: { object: { message: "Use 'unknown' or a specific interface instead of 'object'", fixWith: "Record<string, unknown>" } } }]` — disallow `object` type; prefer `unknown` or concrete interfaces.
- The config spreads `...require("@typescript-eslint/eslint-plugin").configs.recommended.rules` — the plugin's recommended rules are also enforced.

Practical notes:

- To update linting behavior, modify `eslint.config.cjs` and add tests or examples demonstrating why a change is safe.
- Run linter: `npm run lint`. Auto-fix safe issues: `npm run lint:fix`.

---

If anything is unclear or you'd like more examples (e.g., a guide for adding a new operator or a complete sample PR), tell me which area to expand and I'll iterate.
