# Tuff — Programming Language Interpreter

## Quick Start

- **Test**: `bun test`
- **Typecheck**: `bun run typecheck`
- **Run**: `bun run index.ts`
- **Quality gates** (`.github/hooks/hooks.json`): typecheck → cpd (duplication check) → test — all must pass on Stop hook

## Architecture

Single-file AST-based interpreter: `tokenize()` → `parse()` → `Ast` → `evalAst()` → `Value` → `number`

- `index.ts` — tokenizer, parser, evaluator, all exports (~1200 lines). Entry point: `export function evaluate(source: string): number`
- `index.test.ts` — test suite, one test per feature (~300 tests). Each test: `test('evaluate("<code>") => <result>', () => { expect(evaluate("<code>")).toBe(<result>) })`
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

Numbers, booleans, strings, chars, tuples, arrays, records, null, references (`&`, `&mut`, `*`), type annotations (`: U8`, `: I32`, etc.), functions, closures, `if`/`else`, `while`, `for` (range), `match`, `yield`, `return`, `continue`, `break`, array mutation, string indexing & length.

## Key Conventions

- **Value type**: discriminated union — `number`, `bool`, `fn`, `ref`, `tuple`, `null`, `array`, `string`, `record`
- **AST types**: see `type Ast` union in `index.ts` — add new variants here when adding features
- **ControlFlow**: shared discriminated union for `continue`, `break`, `yield`, `return` — use this type, not symbols
- **Scope**: `scopes: Scope[]` array; `mutables: Scope["mutable"][]` array — traverse both for assignments
- **Tokenizer**: multi-char lookahead required for `==`, `!=`, `<=`, `>=`, `=>`, `..`, `||`, `&&`, `+=`
- **Safety**: 10,000 iteration limit on `while`/`for` loops
- **No extra files**: keep everything in `index.ts` unless explicitly asked to split
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
