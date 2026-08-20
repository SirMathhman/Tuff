# AGENTS.md

Tuff is a small compiler/evaluator for an expression language. Pipeline: `core` (lexer, AST, errors, scopes) → `parser` (cursor-based recursive descent) → `evaluator` (static typecheck pass, then total runtime evaluation) → `src/index.ts` (thin facade: `evaluate(expression: string): Result<number, EvalError>`).

## Language features

`let`/assignment (incl. `+=`, deref and index lvalues), `if`/`while` statements and `if` expressions, `for (i in start..end)` ranges, `match` with literal/`_` patterns (a wildcard arm is required), pointers (`&`/`&mut`, `*`), arrays with index lvalues, `is` type tests, suffixed numeric literals (`U8`–`U64`, `I8`–`I64`, `USize`, `F32`/`F64`), and `{ ... }` block values. Booleans evaluate to `1`/`0` in numeric contexts.

## Commands

| Task                             | Command                                          |
| -------------------------------- | ------------------------------------------------ |
| Test                             | `pnpm test:jest`                                 |
| Typecheck                        | `pnpm lint:typecheck`                            |
| Lint                             | `pnpm lint:eslint`                               |
| Format                           | `pnpm format:prettier`                           |
| File-level circular imports      | `pnpm madge:circular`                            |
| Directory-level circular imports | `pnpm lint:circular-packages` (requires `bun`)   |
| Dependency graph                 | `pnpm madge:visualize` (writes `docs/graph.svg`) |

`pnpm lint:pmd:cpd` (copy-paste detection) requires `pmd`, which is not a devDependency.

## Conventions

- **Imports use `.js` extensions** (`import { tokenize } from "./core/lexer.js"`) — required by `module: NodeNext`; Jest maps them back via `moduleNameMapper`. Never strip them.
- **Result monad, no exceptions.** All fallible functions return `Result<T, EvalError>` (`src/core/errors.ts`). `EvalError` is a discriminated union on `kind`, one named `interface` per variant, most carrying a zero-based character `position` (except `EmptyProgram` and `MissingReturn`) and a doc comment stating the fix. New error kinds get their own variant — never shoehorn into an existing one.
- **Total typecheck, total evaluator.** The static pass (`evaluator/typecheck.ts` plus the `check*.ts` modules: `checkExpressions`, `checkAssignments`, `checkBinaryOps`, `checkControlFlow`, `checkPredicates`) must detect every error the evaluator can produce; the evaluator resolves values and never throws. Defensive evaluator branches return structured `EvalError`s with accurate payloads, never placeholder values.
- **One `Type` model** (`evaluator/types.ts`), structured with a `kind` discriminant — never display strings. Equality is structural. `typeToString` is only for error payloads.
- **No type assertions in the evaluator** — narrow with type guards (`isRange`, `isPointer`, `isArray`) and return a structured error on the defensive branch.
- **No circular dependencies, no load-time registration.** Mutual recursion (e.g. block values) is resolved by explicit dependency threading (parser: `parseBlockValue`; typecheck: `checkBlock`; evaluator: `ValueContext { evalBlock }`). Handler types are exported from the leaf module of each stage.
- **Small files, one concern each** — split before a file passes ~150 lines (ESLint warns at 300).
- **ESLint specifics:** named `interface` required for object types (inline `TSTypeLiteral` is an error); `max-lines-per-function` warns at 50.
- **Tests** live next to modules (`src/**/*.test.ts`): flat `test()` blocks (no `describe` nesting), sentence-style names, exact `toEqual` on the full `Result` object (including `position`), `test.each` with `as const` arrays for sweeps. Small local helpers per file (e.g. `evalSource` in `evaluator.test.ts`). Tests added purely for coverage must carry a comment saying so.

## Pitfalls

- `bun` is required for `lint:circular-packages`; `pmd` for `lint:pmd:cpd` — neither is a devDependency.
- The Jest tsconfig override (`module: CommonJS`) exists to reconcile NodeNext source with the test runner — don't "fix" it.
- `core/` must never import from `parser/` or `evaluator/` (DAG: root → {parser, evaluator} → core).
