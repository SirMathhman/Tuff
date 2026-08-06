# Tuff — Programming Language Interpreter

## Quick Start

- **Test**: `bun run test` (Node test runner via tsx + `test/bun-test-shim.ts` — canonical, what quality gates run). Fast alternative: `bun test` (Bun native). Run both before committing
- **Lint/typecheck**: `bun run lint` (runs `tsc --noEmit` then `eslint . --fix` — note: auto-fixes files in place)
- **Duplication check**: `bun run cpd` (PMD, min 50 tokens)
- **Quality gates** (`.github/hooks/hooks.json`): `bun run lint` → `bun run cpd` → `bun run test` — all must pass on Stop hook
- **No CLI/main**: `index.ts` only exports library functions — there is nothing to run standalone

## Architecture

Modular AST-based interpreter: `tokenize()` → `parse()` → `Ast` → `evalAst()` → `Value` → `number`

- `index.ts` — thin wrapper. Entry points: `evaluate(source, args?)`, `evaluateModules(entries, modules)`, `compile(source)` (hybrid: constant-folds programs that don't read `args`; emits real JS with `args` as a free variable for programs that do)
- `src/index.ts` — barrel exports all `src/` modules
- `src/types.ts` — core type definitions: `Token`, `Value`, `ControlFlow`, `AstType`, `Ast`, `Scope`, `EvalContext`
- `src/values.ts` — value constructors (`num`, `bool`), conversions (`toNum`, `truthy`), comparisons (`eq`, `ne`, `lt`, `lte`, `gt`, `gte`, `notOp`), binary operations (`applyBinOp`)
- `src/tokenizer.ts` — `tokenize()` function
- `src/parser.ts` — `parse()` function
- `src/typeparser.ts` — `parseType()` function (recursive type annotation parser, shared by `let` annotations and `is` operator)
- `src/evaluator.ts` — `evalAst(ast, ctx)` function with scope management; `ctx: EvalContext` carries scopes, mutables, exports, module hooks
- `src/typesystem.ts` — type system: `suffixRanges`, `checkSuffix`, `defineStruct`/`getStructFields`, `defineEnum`/`getEnumVariants`, `defineTypeAlias`, `resolveType`, `resolveAstType`, `valueMatchesType` (for `is`), `checkValueAgainstType` (shared value-vs-type validation used by `let` annotations and function call params)
- `src/modules.ts` — `ModuleLoader` class: shared-scope module evaluation with `out` exports, lazy cross-module loading, and circular-dependency detection
- `src/codegen.ts` — hybrid compiler: `referencesArgs(ast)` (true if the AST reads the `args` input) and `compileAst(ast)` (emits JS for args-dependent programs, with `args` as a free variable)
- `index.test.ts` — test suite, one test per feature (109 tests). Each test: `test('evaluate("<code>") => <result>', () => { expectValid("<code>", <result>) })`
- `test/helpers.ts` — shared assertions: `expectValid(source, expected, args?)` (asserts BOTH the `evaluate()` and `compile()` routes; both see the same runtime args), `expectEval(source, expected, args?)` (evaluator route only — for programs that must run with real runtime inputs), `expectEvalError(source)`, `expectModules(entries, modules, expected)`
- `test/bun-test-shim.ts` — Node fallback shim for `bun:test`; supports only `toBe` and `toThrow` (don't add other assertions without extending it)
- See [README.md](./README.md) for project overview
- See [MISSING_FEATURES.md](./MISSING_FEATURES.md) for planned features. Features marked **[heap]** require manual memory management (Rust-style ownership/borrowing) — no GC

## Development Workflow

**Test-first, feature-by-feature:**

1. User provides test case (e.g., `"'\\n'" => 10`)
2. Add test to `index.test.ts`
3. Run `bun test` — confirm failure
4. Implement minimum code to pass
5. Run `bun test` **and** `bun run test` — confirm all pass in both runners (a change that breaks `compile()` fails tests even when `evaluate()` works, since `expectValid` exercises both)
6. `git add -A && git commit -m "<feature description>"`
7. Suggest one architectural improvement

## Implemented Features

Numbers, booleans, strings, chars, tuples, arrays, records, null, references (`&`, `&mut`, `*`), type annotations (`: U8`, `: I32`, etc.), functions (params require type annotations, e.g. `fn add(x : I32, y : I32)`), closures, recursion, `if`/`else`/`else if`, `while`, `for` (range), `match` (with `_` wildcard), `yield`, `return`, `continue`, `break`, array mutation, string indexing & length, `%`, `+=`/`-=`, structs, enums (`Color::Red`), union types (`Bool | I32`), type aliases (`type Id = U32`), `is` operator, modules (`evaluateModules`, `out` exports, `::` namespace paths).

## Key Conventions

- **Value type**: discriminated union — `number` (carries optional `type` suffix), `bool`, `fn`, `ref`, `tuple`, `null`, `array`, `string`, `record`, `struct`, `enum`
- **AST types**: see `type Ast` union in `src/types.ts` — add new variants here when adding features
- **AstType**: see `type AstType` in `src/types.ts` — `primitive`, `array`, `struct`, `union` variants. Use for type annotations and `is` operator
- **ControlFlow**: shared discriminated union for `continue`, `break`, `yield`, `return` — use this type, not symbols
- **Scope**: `scopes: Scope[]` array; `mutables: Scope["mutable"][]` array — traverse both for assignments
- **Tokenizer**: multi-char lookahead required for `==`, `!=`, `<=`, `>=`, `=>`, `..`, `||`, `&&`, `+=`, `-=`, `::`
- **Safety**: 10,000 iteration limit on `while`/`for` loops
- **Global type state**: struct/enum/type-alias definitions live at module level in `src/typesystem.ts` and persist across `evaluate()` calls in the same process — they can leak between tests
- **Module structure**: each `src/` file is a single responsibility module. Import from `src/index.ts` barrel for cross-module access
- **Test format**: `test('evaluate("<code>") => <result>', ...)` for success, `test('evaluate("<code>") => Error', ...)` for failures

## Pitfalls

- `==` tokenized as two `=` — check multi-char tokens before single
- `..` tokenized as two `.` — check `..` before `.`
- `0..4` tokenized as `0.` — only consume `.` if followed by digit
- `_` wildcard parsed as identifier — needs dedicated AST node
- `tuple.0` tokenized as number — separate `.` from number tokenization
- Always parse `if` as statement first, fall back to expression
- Don't create new `Symbol()` for control flow — use `ControlFlow` type
- `yield`/`return`/`break`/`continue` are thrown as plain objects (`{kind,...}`) — catch via `isControlFlow()`, never `new Error`
- `true`/`false`/`out` are identifiers, not keywords — matched by value in `parseAtom`/`parseStatement`
- `match` with no matching case returns `num(0)`; out-of-bounds string index returns `num(0)` (array index returns `undefined`)
- Numeric suffixes (`U8`, `I32`, etc.) carry type info — validate ranges on assignment (`checkSuffix`); suffix propagates to `Value.type` for `is` and union matching
- `evaluate()` returns `number` via `toNum()` — all expression results coerce to number
- `is` parses in `parseComparison`; evaluated via `valueMatchesType`
- Function params must be type-annotated — enforced via `checkValueAgainstType` on call
- Don't add assertion methods beyond `toBe`/`toThrow` without extending `test/bun-test-shim.ts`
