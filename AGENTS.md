# Tuff — Programming Language Interpreter

## Quick Start

- **Test**: `bun test`
- **Lint/typecheck**: `bun run lint` (runs `tsc --noEmit` then `eslint . --fix`)
- **Duplication check**: `bun run cpd`
- **Run**: `bun run index.ts`
- **Quality gates** (`.github/hooks/hooks.json`): `bun run lint` → `bun run cpd` → `bun test` — all must pass on Stop hook

## Architecture

Modular AST-based interpreter: `tokenize()` → `parse()` → `Ast` → `evalAst()` → `Value` → `number`

- `index.ts` — thin wrapper. Entry points: `evaluate(source)` and `evaluateModules(entries, modules)`
- `src/index.ts` — barrel exports all `src/` modules
- `src/types.ts` — core type definitions: `Token`, `Value`, `ControlFlow`, `AstType`, `Ast`, `Scope`
- `src/values.ts` — value constructors (`num`, `bool`), conversions (`toNum`, `truthy`), comparisons (`eq`, `ne`, `lt`, `lte`, `gt`, `gte`, `notOp`), binary operations (`applyBinOp`)
- `src/tokenizer.ts` — `tokenize()` function
- `src/parser.ts` — `parse()` function
- `src/typeparser.ts` — `parseType()` function (recursive type annotation parser, shared by `let` annotations and `is` operator)
- `src/evaluator.ts` — `evalAst()` function with scope management
- `src/typesystem.ts` — type system: `suffixRanges`, `checkSuffix`, `resolveType`, `resolveAstType`, `defineTypeAlias`, `checkValueAgainstType` (shared value-vs-type validation used by `let` annotations and function call params)
- `src/modules.ts` — `ModuleLoader` class: shared-scope module evaluation with `out` exports, lazy cross-module loading, and circular-dependency detection
- `index.test.ts` — test suite, one test per feature (~96 tests). Each test: `test('evaluate("<code>") => <result>', () => { expect(evaluate("<code>")).toBe(<result>) })`
- See [README.md](./README.md) for project overview
- See [MISSING_FEATURES.md](./MISSING_FEATURES.md) for planned features

## Development Workflow

**Test-first, feature-by-feature:**

1. User provides test case (e.g., `"'\\n'" => 10`)
2. Add test to `index.test.ts`
3. Run `bun test` — confirm failure
4. Implement minimum code to pass
5. Run `bun test` — confirm all pass
6. `git add -A && git commit -m "<feature description>"`
7. Suggest one architectural improvement

## Implemented Features

Numbers, booleans, strings, chars, tuples, arrays, records, null, references (`&`, `&mut`, `*`), type annotations (`: U8`, `: I32`, etc.), functions (params require type annotations, e.g. `fn add(x : I32, y : I32)`), closures, `if`/`else`, `while`, `for` (range), `match`, `yield`, `return`, `continue`, `break`, array mutation, string indexing & length.

## Key Conventions

- **Value type**: discriminated union — `number`, `bool`, `fn`, `ref`, `tuple`, `null`, `array`, `string`, `record`
- **AST types**: see `type Ast` union in `src/types.ts` — add new variants here when adding features
- **AstType**: see `type AstType` in `src/types.ts` — `primitive` and `array` variants. Use for type annotations and `is` operator
- **ControlFlow**: shared discriminated union for `continue`, `break`, `yield`, `return` — use this type, not symbols
- **Scope**: `scopes: Scope[]` array; `mutables: Scope["mutable"][]` array — traverse both for assignments
- **Tokenizer**: multi-char lookahead required for `==`, `!=`, `<=`, `>=`, `=>`, `..`, `||`, `&&`, `+=`
- **Safety**: 10,000 iteration limit on `while`/`for` loops
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
- Numeric suffixes (`U8`, `I32`, etc.) carry type info — validate ranges on assignment
- `evaluate()` returns `number` via `toNum()` — all expression results coerce to number
