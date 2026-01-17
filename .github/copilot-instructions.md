# Copilot instructions for Tuff

Tuff is a TypeScript interpreter and JS compiler for a tiny expression language (typed integer literals like `100U8`, structs/enums, arrays/tuples/pointers, closures/`this`, loops/`match`, booleans as 1/0).

## Quick start

- **Public API**: `interpret(input, context?)` in `src/interpret.ts` validates and executes Tuff code, returns `Result<any>`
- **Dual compilation**: `compile(input)` in `src/compiler/compile.ts` → JS string; `run(input, stdin)` in `src/compiler/run.ts` → executes compiled JS
- **Two separate frontends**: Interpreter and compiler are independent; never pipe one through the other. Code duplication expected—refactor shared logic instead.
- **Test patterns**: Use `assertInterpretAndCompileValid(input, expected)` in test-helpers.ts to validate both paths simultaneously

## Architecture layers (read in this order)

1. **Parser**: Builds AST via operator precedence parsing; handles typed numbers, blocks as expressions, control flow, calls/field/index
2. **Interpreter**: Statement layer → expression evaluation. Scoping via block contexts. Validates semantic constraints (undefined variables, type ranges after arithmetic)
3. **Compiler**: Independent validation pipeline (NOT calling interpreter). Validates numeric literal type constraints, evaluates constant-only expressions (constant folding), generates JS, replaces `read<T>()` calls, wraps for Node.js
4. **Type system**: Structs/enums, arrays/tuples, pointers. Type ranges enforced both at literal parse time and after arithmetic operations
5. **Cross-cutting**: Control flow markers, side-channels for struct/function references

## Critical patterns

- **Result<T>**: All functions return `{ type: 'ok', value }` or `{ type: 'err', error }`. **Always** check `type === 'err'` before accessing `value`.
- **Block scoping**: `let` bindings local to block. Mutations to outer bindings propagate via reference. New `let` bindings don't leak outward.
- **Compiler independence**: Compiler must NEVER call interpreter. Each has separate validation:
  - **Interpreter** validates: undefined variables, duplicate bindings, expression evaluation semantics (overflow after arithmetic, division by zero with live values)
  - **Compiler** validates: numeric literal type ranges (e.g., `256U8` invalid), constant-only arithmetic expressions (constant folding optimizations like `1U8 + 255`, `10 / (2 - 2)`)
- **Constant folding**: Compiler evaluates pure arithmetic expressions (literals + operators, no variables/`let`/`read<>`) at compile time, catching errors early. Skip validation for non-constant code.
- **Binding stability**: Closures rely on reference identity—mutate bindings in-place, don't replace objects.
- **stdin in compiler**: Compiler generates JS reading stdin. Replace `read<T>()` calls with typed input parsing.

## Test organization & execution

- **Directories**: `tests/interpreter/` (core language), `tests/compiler-runtime/` (JS generation), `tests/features/` (advanced features), `tests/types/` (type system)
- **Test paths (three categories)**:
  - **Dual-path** (`assertInterpretAndCompileValid/Invalid`): Both interpreter and compiler handle the test case equally. Use for valid code and errors both can detect (static literal ranges, constant arithmetic overflows, division by zero in constants)
  - **Interpreter-only** (`assertInterpretInvalid`): Semantic errors only interpreter can catch (undefined variables, duplicate bindings, type range violations with live values). Compiler skips these (has no variable context)
  - **Compiler-only** (`assertCompileValid` with stdin): stdin-dependent code. Interpreter can't test without hardcoding stdin; compiler generates JS that reads from stdin
- **Porting strategy**: When migrating interpreter tests to compound tests:
  1. Check if error is **static** (literal ranges, constant arithmetic): use `assertInterpretAndCompileInvalid`
  2. Check if error is **semantic** (variables, scoping): keep as `assertInterpretInvalid`
  3. Adjust test description if needed to clarify scope
- **Run tests**: `pnpm test`, `pnpm test:watch`, `pnpm test:coverage`. Pre-commit gates: `pnpm lint`, `pnpm cpd`, `npm run check-size`

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

1. Add interpreter support first (parsing + evaluation + validation)
2. Add compiler support (code generation, constant folding where applicable)
3. Write tests using appropriate assertion helpers:
   - Valid code and compile-time-detectable errors → dual-path tests
   - Semantic errors → interpreter-only tests
   - stdin-dependent logic → compiler-only tests
4. Verify: `pnpm test`, `pnpm lint`, `pnpm cpd`
