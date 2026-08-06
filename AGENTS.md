# Tuff — Programming Language Interpreter

## Quick Start

- **Test**: `bun run test` (Node test runner via tsx + `test/bun-test-shim.ts` — canonical, what quality gates run). Fast alternative: `bun test` (Bun native). Run both before committing
- **Lint/typecheck**: `bun run lint` (runs `tsc --noEmit` then `eslint . --fix` — note: auto-fixes files in place)
- **Duplication check**: `bun run cpd` (PMD, min 50 tokens)
- **Quality gates** (`.github/hooks/hooks.json`): `bun run lint` → `bun run cpd` → `bun run test` — all must pass on Stop hook
- **No CLI/main**: `index.ts` only exports library functions — there is nothing to run standalone

## Architecture

Modular AST-based interpreter: `tokenize()` → `parse()` → `analyze()` → `evalAst()` → `Value` → `number`

- `index.ts` — thin wrapper. Entry points: `evaluate(source, args?)`, `evaluateModules(entries, modules)`, `compile(source)` (always codegen via `compileAst(ast, typeEnv)` — no constant-folding branch anymore). Private helpers `analyzeProgram()` (parse + analyze once) and `evalContext()` (fresh scopes + args input)
- `src/index.ts` — barrel exports all `src/` modules
- `src/types.ts` — core type definitions: `Token`, `Value`, `ControlFlow`, `AstType`, `Ast`, `Scope`, `TypeEnv`, `EvalContext`
- `src/values.ts` — value constructors (`num`, `bool`), conversions (`toNum`, `truthy`), comparisons (`eq`, `ne`, `lt`, `lte`, `gt`, `gte`, `notOp`), binary operations (`applyBinOp`)
- `src/tokenizer.ts` — `tokenize()` function
- `src/parser.ts` — `parse()` function
- `src/typeparser.ts` — `parseType()` function (recursive type annotation parser, shared by `let` annotations and `is` operator)
- `src/evaluator.ts` — `evalAst(ast, ctx)` function with scope management; `ctx: EvalContext` carries scopes, mutables, exports, module hooks, and the analyzed `typeEnv`
- `src/analyzer.ts` — semantic analysis pass: `analyze(ast, typeEnv, opts?)` builds a per-program `TypeEnv` and validates BEFORE evaluation (see Analyzer Checks below). `newTypeEnv()` creates the empty per-program symbol table
- `src/typesystem.ts` — type system: `suffixRanges`, `checkSuffix`, `defineStruct`/`getStructFields`, `defineEnum`/`getEnumVariants`, `defineTypeAlias`, `resolveType`, `resolveAstType`, `valueMatchesType` (for `is`), `checkValueAgainstType` (shared value-vs-type validation used by `let` annotations and function call params)
- `src/modules.ts` — `ModuleLoader` class: TWO-PASS static analysis (pass 1 per-module `analyze`, pass 2 re-analyze with full `moduleNames`/`moduleEnvs` for cross-module export/input validation), then shared-scope eval with `out` exports, lazy loading, and circular-dependency detection
- `src/codegen.ts` — compiler: `compileAst(ast, typeEnv)` emits JS for EVERY program with `args` as a free variable. `referencesArgs(ast)` is vestigial (unused — the old constant-fold branch was removed)
- `index.test.ts` — test suite, one test per feature (116 tests). Each test: `test('evaluate("<code>") => <result>', () => { expectValid("<code>", <result>) })`
- `test/helpers.ts` — shared assertions: `expectValid(source, expected, args?)` (asserts BOTH the `evaluate()` and `compile()` routes with the same runtime args), `expectEval(source, expected, args?)` (evaluator route only), `expectInvalid(source)` (asserts BOTH routes throw — renamed from `expectEvalError`), `expectModules(entries, modules, expected)`
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

## Analyzer Checks

`analyze(ast, typeEnv, opts?)` runs BEFORE evaluation (and before codegen). It validates (each with its exact error message): suffix overflow on literals and negated literals (`-100U8`), `block has no value` (statement-only `let` RHS), literal-vs-annotation (`checkValueAgainstType` assign mode), `cannot assign to immutable variable`, `undeclared variable`, `can only take reference of identifier`, `cannot dereference non-reference`, `cannot index <T>`, `cannot get length of <T>`, `yield has no value`, `circular type alias`, `undeclared namespace`, `field <prop> not found` (module exports), `unknown struct`, `unknown field on struct`, `unknown input on module` (instantiation inputs), and call-arg literal-vs-param-type (`pass` mode). `opts.moduleNames`/`opts.moduleEnvs` enable cross-module validation. The evaluator keeps only RUNTIME-dependent guards (missing input, infinite loop, not-a-function, value-shape errors).

## Codegen Design (src/codegen.ts)

- **Mutable cells**: `let mut x` → `var x = { v: <expr> };` — all reads/assigns/`&mut`/`*` unwrap `.v`; `&mut x` aliases the cell so `*y = v` writes through. Immutable bindings stay plain `var`.
- **`var` not `let`**: allows redeclaration (`let x = 0; let x = 1;`) matching the evaluator's silent overwrite.
- **Return sentinel**: `return` → `throw { __return: true, value };` caught by the fn wrapper `catch (e) { if (e && e.__return) return e.value; throw e; }` — unwinds past surrounding expressions like the evaluator's thrown ControlFlow. `yield` → plain IIFE-local `return`.
- **Coercion**: emitted code ends `process.exit(Number(<expr>));` — mirrors `toNum`. String indexing emits `typeof (t)[i] === "string" ? charCodeAt(0) : (t)[i]`. Enums encode as `"Color::Red"` strings. `is` folds via `TypeEnv.inferred`/literal suffixes, else falls back to JS tag checks.
- Type declarations and `inlet` erase to `""`; statement-as-block-value wraps in an IIFE yielding `0`.

## Implemented Features

Numbers, booleans, strings, chars, tuples, arrays, records, null, references (`&`, `&mut`, `*`), type annotations (`: U8`, `: I32`, etc.), functions (params require type annotations, e.g. `fn add(x : I32, y : I32)`), closures, recursion, `if`/`else`/`else if`, `while`, `for` (range), `match` (with `_` wildcard), `yield`, `return`, `continue`, `break`, array mutation, string indexing & length, `%`, `+=`/`-=`, structs, enums (`Color::Red`), union types (`Bool | I32`), type aliases (`type Id = U32`), `is` operator, modules (`evaluateModules`, `out` exports, `in let` inputs, `lib { x : 100 }` instantiation, `::` namespace paths).

## Key Conventions

- **Value type**: discriminated union — `number` (carries optional `type` suffix), `bool`, `fn`, `ref`, `tuple`, `null`, `array`, `string`, `record`, `struct`, `enum`
- **AST types**: see `type Ast` union in `src/types.ts` (44 variants) — add new variants here when adding features
- **AstType**: see `type AstType` in `src/types.ts` — `primitive`, `array`, `slice`, `struct`, `union`, `ref`, `tuple` variants. Use for type annotations and `is` operator
- **TypeEnv**: per-program symbol table — `structs`, `enums`, `aliases`, `inferred`, `mutables`, `exports`, `inputs`, `fns`. Thread it into BOTH `evalAst` (via `EvalContext.typeEnv`) and `compileAst`
- **ControlFlow**: shared discriminated union for `continue`, `break`, `yield`, `return` — use this type, not symbols
- **Scope**: `scopes: Scope[]` array; `mutables: Scope["mutable"][]` array — traverse both for assignments
- **Tokenizer**: multi-char lookahead required for `==`, `!=`, `<=`, `>=`, `=>`, `..`, `||`, `&&`, `+=`, `-=`, `::`
- **Safety**: 10,000 iteration limit on `while`/`for` loops
- **Global type state**: struct/enum/type-alias definitions are tracked in a per-program `TypeEnv` (from `analyze()`) — the old module-level state in `src/typesystem.ts` still exists for compatibility but `evaluate()`/`compile()` use the analyzed `TypeEnv` (note: evaluator's `typealias`/`structdef`/`enumdef` still call the global definers, so state can leak between `evaluate()` calls)
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
- `true`/`false`/`out`/`in` are identifiers, not keywords — matched by value in `parseAtom`/`parseStatement`
- `match` with no matching case returns `num(0)`; out-of-bounds string index returns `num(0)` (array index returns `undefined`)
- Numeric suffixes (`U8`, `I32`, etc.) carry type info — validate ranges on assignment (`checkSuffix`); suffix propagates to `Value.type` for `is` and union matching
- `evaluate()` returns `number` via `toNum()` — all expression results coerce to number
- `is` parses in `parseComparison`; evaluated via `valueMatchesType`; folded at compile time via `TypeEnv.inferred`
- Function params must be type-annotated — enforced via `checkValueAgainstType` on call
- `expectValid` prepends `in let args : &[&Str]; ` and passes `["mock_program_name", ...args]` to BOTH routes — an `inlet args` compiles to `""` and `args` idents emit `args` directly
- A change that breaks `compile()` fails tests even when `evaluate()` works, since `expectValid` exercises both
- Don't add assertion methods beyond `toBe`/`toThrow` without extending `test/bun-test-shim.ts`
- `bun test` may crash with a kernel32.dll native crash at the end of a run on Windows — use `bun run test` for verification
