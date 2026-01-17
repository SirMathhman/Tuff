# Copilot instructions for Tuff

Tuff is a TypeScript interpreter and JS compiler for a tiny expression language (typed integer literals like `100U8`, structs/enums, arrays/tuples/pointers, closures/`this`, loops/`match`, booleans as 1/0).

## Quick start

- **Public API**: `interpret(input, context?)` in `src/interpret.ts` validates and executes Tuff code, returns `Result<any>`
- **Dual compilation**: `compile(input)` in `src/compiler/compile.ts` → JS string; `run(input, stdin)` in `src/compiler/run.ts` → executes compiled JS
- **Two separate frontends**: Interpreter and compiler are independent; never pipe one through the other. Code duplication expected—refactor shared logic instead.
- **Test patterns**: Use `assertInterpretAndCompileValid(input, expected)` in test-helpers.ts to validate both paths simultaneously

## Architecture layers (read in this order)

1. **Parser**: `src/parser/parser.ts` → `parseLiteral()` + `findOperator()` build AST; `src/parser/literal-parser.ts` handles typed numbers, blocks as expressions, `if/else`, `match`, calls/field/index
2. **Interpreter**: Statement layer (`src/interpreter/statements.ts`) → expression evaluation (`src/interpreter/evaluator.ts`). Scoping via `createScopedContext()`
3. **Compiler**: `src/compiler/compile.ts` pipeline: validate via interpreter → `stripLetTypeAnnotations()` → `compileBracedExpressionsToIife()` → `stripTypeSuffixes()` → replace `read<T>()` → wrap for Node.js output
4. **Type system**: Structs/enums (`src/types/`), arrays/tuples (`src/types/arrays.ts`, `src/types/tuples.ts`), pointers (`src/types/pointers.ts`)
5. **Cross-cutting**: Control flow markers (`__YIELD__`, `__RETURN__`), side-channels (struct instances in `common/struct-values.ts`, function refs in `common/function-references.ts`)

## Critical patterns

- **Result<T>** (`src/common/result.ts`): All functions return `{ type: 'ok', value }` or `{ type: 'err', error }`. **Always** check `type === 'err'` before accessing `value`.
- **Block scoping**: `let` in inner blocks never leak. Mutations to *existing* outer bindings propagate via `applyScopedMutationsToContext()`. New `let` bindings stay local.
- **Global vs local**: `struct`/`enum`/`fn` defs register globally; only top-level creates local bindings. Inner defs callable globally but don't pollute outer scope.
- **Side-channels**: When evaluating expressions, track latest struct instance and function reference; propagate via `propagateSideChannels()` across braced expressions.
- **Binding stability**: Closures rely on reference identity—mutate bindings in-place via `applyUpdatedBindingsInPlace()` in `interpreter/evaluator.ts`, don't replace objects.
- **stdin in compiler**: `compile()` generates JS that reads stdin via `require('fs').readFileSync(0)`, splits by whitespace. Replace `read<T>()` calls with `parseInt` or type-validated wrappers.

## Test organization & execution

- **Directories**: `tests/interpreter/` (core language), `tests/compiler-runtime/` (JS generation), `tests/features/` (closures, this, modules), `tests/types/` (arrays, tuples, pointers, enums)
- **Dual validation**: Tests use helpers that run both `interpret()` and `run()` to catch divergence. E.g., `assertInterpretAndCompileValid('1U8 + 2U8', 3)`
- **Run tests**: `pnpm test` (all), `pnpm test:watch`, `pnpm test:coverage`. Lint gates before commit: `pnpm lint`, `pnpm cpd`, `npm run check-size`

## Strict lint rules (don't bypass)

- **Function length**: Max 50 lines. Extract helpers (e.g., `buildStdinSetup()`, `processNumericToken()`) when approaching limit.
- **Nesting**: Max depth 2. Use helper functions to flatten conditionals and loops.
- **No regex literals**: Use string methods (`indexOf`, `split`, `substring`) instead. Example: ANSI stripping via loop over `code[i]` not `/\u001b\[.../g`
- **No ternaries**: Use explicit `if/else` or extract to helper returning the value.
- **No nulls**: Use `undefined` everywhere. Enable `strict-boolean-expressions` type checking.
- **Naming**: camelCase for variables/functions, PascalCase for types/interfaces, UPPER_CASE for constants. Environment variables (e.g., `NODE_NO_COLORS`) assigned outside object literals to avoid naming errors.
- **Anonymous types banned**: Define named `interface` for all object shapes (e.g., `interface NumericToken { consumed: number; digits: string; }`).
- **Tabs for indent**; spaces rejected by formatter.

## Adding new features

1. Add interpreter support first (`src/interpreter/` + `src/parser/`)
2. Mirror in compiler (`src/compiler/compile.ts` transformations)
3. Write tests in appropriate `tests/*/` subdirectory using dual-path assertions
4. Verify: `pnpm test`, `pnpm lint`, `pnpm cpd`
