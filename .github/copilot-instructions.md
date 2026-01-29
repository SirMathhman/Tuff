# GitHub Copilot Instructions — Tuff ⚡️

## Purpose
Tuff is a **TypeScript DSL interpreter** that parses and evaluates a custom language with typed numeric literals, variables, control flow, and type safety. AI agents should understand its type system and recursive evaluation architecture.

---

## Quickstart 🚀
- Install: `pnpm install`
- Test: `pnpm test` (Jest + ts-jest; tests in `tests/`)
- Dev: `pnpm dev` (ts-node, no build needed)
- Build: `pnpm build` (`tsc` → `dist/`)
- Lint/format: `pnpm lint --fix` and `pnpm format`
- Type-check: `pnpm typecheck`

---

## Core Architecture 💡
The heart of Tuff is the **`interpret(input: string): number`** function (`src/index.ts`). It evaluates a domain-specific language supporting:

### Type System
- **Suffixed numeric types**: `U8`, `U16`, `U32`, `U64` (unsigned) and `I8`, `I16`, `I32`, `I64` (signed)
- **Bool type**: `true`/`false` (values 0/1, not convertible to/from numbers)
- **Type narrowing**: Assigning a wider type to narrower target throws error (e.g., `100U16` → `U8`)
- **Untyped literals default to I32**: e.g., `let x = 100;` infers `I32` not `U8`

### Evaluation Features
- **Operator precedence**: `*/` before `+-` before comparisons before `&&` before `||`
- **Variable scoping**: `let x = 1;` in blocks doesn't leak; contexts merge on exit
- **Mutability**: `let mut x = 0; x = 5;` allowed; immutable `let x = 0; x = 5;` throws
- **Control flow**: `if (bool_expr) expr1 else expr2` and `while (bool_expr) body` with type validation
- **Compound ops**: `x += 1`, `x -= 1`, `x *= 2`, `x /= 2` (forbidden on Bools)

### Recursive Evaluation Pattern
- `processExprWithContext()` — top-level entry; handles `if`, parentheses, braces, blocks
- `processBlock()` — statement processing; separates declarations, assignments, loops, final expression
- `evaluateExpression()` — core operator evaluation with precedence handling

**Key insight**: Type validation happens _during_ evaluation, not before. Check `tests/interpret.test.ts` for 100+ edge cases.

---

## Developer Workflows 🔧
- **Adding behavior**: Extend `interpret()` directly (no separate modules needed).
- **Testing edge cases**: Each test in `tests/interpret.test.ts` documents a validation rule. Before modifying type or operator logic, read nearby tests.
- **Strict mode**: `tsconfig.json` enforces `strict: true`; all types explicit. Function signatures must declare return types.
- **Quick iteration**: `pnpm dev` runs `ts-node src/index.ts` directly without rebuild.

---

## Common Patterns & Gotchas ⚠️
- **Type suffix case-sensitivity**: `U8` valid, `u8` throws `invalid suffix`.
- **Bool isolation**: `true && 100` → error; `1 == 1` → Bool (1), `100 == 100` → Bool (1).
- **Default type**: Bare `100` in `let x = 100;` is `I32`, not unsigned; `let x = 100U8;` is `U8`.
- **Operator precedence**: Multiplication binds tighter than addition; use parens to override.
- **Empty blocks return 0**: `{ let x = 1; }` evaluates to 0; trailing expressions matter: `{ let x = 1; x }` → 1.
- **While loops don't return values**: `while (x < 10) x += 1;` is a statement; capture result after: `let mut x = 0; while (x < 10) x += 1; x`.

---

## Testing & CI 🧪
- Jest uses `@swc/jest` (faster than ts-jest); run with `pnpm test`.
- Filter tests: `pnpm test -- -t "interprets addition"` or `pnpm test interpret.test.ts`.
- Tests import directly from `../src/index` (no build needed).
- No GitHub Actions workflow in repo; add if automated testing on push needed.

---

## Linting & Pre-commit 🧹
- ESLint (flat config, `@typescript-eslint` + `prettier`) enforces Prettier formatting.
- Husky + lint-staged auto-fix on commit; **always commit without `--no-verify`** and fix errors before committing.
- Unused variable warnings ignored if prefixed with `_` (e.g., `_unused`).

---

## Key Files 🗂️
- `src/index.ts` — `add()` stub + 800-line `interpret()` implementation with type system and recursive evaluation
- `tests/interpret.test.ts` — 100+ test cases defining type/operator/control-flow rules and edge cases
- `tsconfig.json` — strict mode, ES2020 target, CommonJS output
- `jest.config.cjs` — SWC transformer (faster than ts-jest), `tests/` root

---