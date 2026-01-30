# GitHub Copilot Instructions — Tuff

## Repo shape

- Interpreter + compiler live in `src/index.ts` (single-file, ~7.6k LOC; most logic is inside `interpret()` and `compile()`).
- The DSL spec is the test suite (originally `tests/interpret.test.ts`, now split by feature into ~20 files like `variables.test.ts`, `pointers.test.ts`, etc.).
- Tests assert exact behavior and error messages for BOTH interpreter and compiler using `assertValid(code, expected)` / `assertInvalid(code)` from `tests/utils.ts`.
- Multi-file tests use `assertAllValid(inputs, config, nativeConfig, expected)` / `assertAllInvalid(...)` for module system validation.
- The CLI runner (`pnpm start` / `pnpm dev`) executes `bun ./src/index.ts`, which loads `src/*.tuff` and `src/*.ts` files as modules via `buildReplInputs()`.
- For DSL syntax and semantics overview, see [TUTORIAL.md](../TUTORIAL.md).

## Skills and utilities

- Reusable skills and utilities are located in `.github/skills/`.
- Each skill provides specialized functionality with documentation.
- When working on tasks that require code extraction, refactoring, or file manipulation, check `.github/skills/copy-and-paste/` for the copy-paste utility and its documentation.
- Read skill documentation in the relevant `SKILL.md` file before using to understand capabilities and best practices.

## Fast workflows

- Dev: `pnpm dev` (nodemon watches `src/**/*.ts` and `*.tuff`; runs `bun ./src/index.ts`)
- Tests: `pnpm test` (Jest via `@swc/jest`)
- Typecheck/build: `pnpm typecheck` / `pnpm build`
- Lint/format: `pnpm lint` and `pnpm format`

## Module system and API exports

- **Single-file API**: `interpret(code: string): number` evaluates Tuff code; `compile(code: string): string` generates C code; `execute(cCode: string): number` compiles C via gcc and returns result.
- **Multi-file API**: `interpretAll(inputs, config, nativeConfig)` and `compileAll(inputs, config, nativeConfig)` handle module dependencies.
  - `config: Map<string[], string>` maps module paths (e.g., `['foo', 'bar']` → `"foo/bar.tuff"`) to Tuff source.
  - `nativeConfig: Map<string[], string>` maps module paths to TypeScript/JavaScript native bindings.
- **Module syntax**: `use { functionName } from moduleName;` imports Tuff symbols; `extern use { name } from mod; extern let/fn ...` declares native bindings.
- **REPL workflow**: `buildReplInputs(rootDir: string)` scans `src/` for `.tuff` and `.ts` files and returns `{ inputs, config, nativeConfig }` for `interpretAll()`.

## Test organization

- Tests are split by feature into separate files: `variables.test.ts`, `pointers.test.ts`, `functions.test.ts`, etc.
- **Critical**: All tests use `assertValid(code, expected)` or `assertInvalid(code)` from `tests/utils.ts` to validate BOTH interpreter (`interpret()`) AND compiler (`compile()` + `execute()`) produce identical results.
- Multi-file tests use `assertAllValid(inputs, config, nativeConfig, expected)` / `assertAllInvalid(...)` to test module system.
- When writing tests, always use these utilities instead of calling `interpret()` or `interpretAll()` directly.
- Python scripts in `scripts/` help with test file reorganization (e.g., `split_tests_v2.py`).

## Interpreter mental model (read `src/index.ts`)

- Entry: `interpret(input: string): number` strips comments then evaluates by calling `processBlock(...)`.
- Parsing strategy is string-based (regex + bracket-depth scans), not a separate AST.
- Runtime model: `Type` + `RuntimeValue` + `Context` (a `Map` holding `{ mutable, initialized, dropFn }` alongside values).
- Symbol tables: `FunctionTable` (`fn ... => ...`), `StructTable` (`struct ... { ... }`), `TypeAliasTable` (`type A = I32 then drop`).
- Core flow:
  - `processBlock()` splits `;`-terminated statements, enforces block scoping, and merges outer vars via `mergeBlockContext()`.
  - `processExprWithContext()` handles higher-level constructs (blocks `{...}`, `if (...) ... else ...`, tuples, arrays, structs, calls) then falls back to `evaluateExpression()`.
  - `evaluateExpression()` does operator precedence + type validation (Bool isolation, overflow/range checks for numeric suffixes).

## Compiler architecture

- Entry: `compile(input: string): string` produces C code, `execute(input: string): number` compiles and runs it via `gcc`.
- C codegen strategy: similar parsing to interpreter but emits C statements/expressions instead of evaluating.
- Type system maps to C: `I32` → `int32_t`, `Bool` → `int`, pointers → `*`, arrays → stack arrays.
- Functions compile to C functions; generics are monomorphized at callsites.

## DSL sharp edges (tests cover these)

- Numeric suffixes are case-sensitive: `100U8` ok, `100u8` throws `invalid suffix`.
- `Bool` is distinct (`true`/`false`, stored as 1/0); arithmetic on Bool errors.
- Arrays: assigning a non-literal array value is rejected (`cannot copy arrays`); arrays track `initializedCount` and must be initialized in order.
- References: `&x` / `&mut x`; only one active mutable reference; deref assignment `*ptr = ...` requires a mutable pointer.
- `this` is a synthetic snapshot of the current scope; functions can be returned as pointers and may carry `boundThis` for method-style calls; `::` extracts unbound function pointers.
- Type constraints exist in declarations: `let x : I32 < 10 = 5;`.

## Repo constraints

- ESLint forbids template literals; use string concatenation / array-join for messages.
