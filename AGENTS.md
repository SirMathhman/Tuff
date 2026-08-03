# AGENTS.md

Guidance for AI coding agents working in this repository.

## What this is

A tree-walking interpreter for a small Rust-like language called **Tuff**, written in TypeScript and run with **Bun**. The public entry point is `interpret(source: string): number` in `index.ts`, which always returns a numeric exit code.

## Commands

- **Run tests:** `bun test` (tests live in `index.test.ts`, using `bun:test`)
- **Copy-paste detection (CPD):** `bun run cpd` — runs PMD CPD over `src/`. This runs automatically on the `Stop` hook (see `.github/hooks/hooks.json`), so keep code DRY and avoid duplicating logic across files.
- **Type-check:** `bunx tsc --noEmit` (strict mode is enabled in `tsconfig.json`)

## Architecture

The pipeline is **lex → parse → evaluate**:

| File | Responsibility |
| --- | --- |
| `src/lexer.ts` | Tokenizes source into `Token[]`; handles integer suffixes (`U8`, `I32`, …) |
| `src/parser.ts` | Recursive-descent parser producing an `AST`; precedence via layered methods (`parseAdditive` → `parseLogicalOr` → … → `parsePrimary`) |
| `src/evaluator.ts` | Tree-walking evaluator; dispatches on `ast.type` |
| `src/environment.ts` | Lexical scoping via parent-chain `Environment`; `define`/`lookup`/`assign`/`child` |
| `src/value.ts` | Value constructors (`makeInteger`, `makeBool`) and numeric coercion (`isNumber`, `toNumber`, `requireNumber`, `isTruthy`) |
| `src/typecheck.ts` | Type system: `typeOf`, `typesEqual`, `integerTypeOf`, and type guards (`isInteger`, `isBool`, `isArray`, `isFunction`) |
| `src/operators.ts` | Operator tables (`binaryOps`, `logicalOps`, `unaryOps`, `assignOps`) |
| `src/functions.ts` | Function call logic (arg count + return type checks, closure env) |
| `src/types.ts` | Shared types: `Token`, `AST`, `Value`, `IntegerTypeName`, `TypeName` |

## Key conventions

- **Test-driven workflow:** This repo is developed test-first. Each commit typically adds a test in `index.test.ts`, then implements the minimal code to pass it. When adding a feature, add the test first.
- **`interpret` returns an exit code, not the value.** Booleans map to `1`/`0`; numbers pass through. Tests assert against these exit codes (e.g. `expect(interpret("1 < 2")).toBe(1)`).
- **Values are tagged objects, not raw primitives.** Booleans are first-class `BoolValue` (`{ kind: "bool", value }`), and integers are `IntegerValue` (`{ kind: "U8" | …, value }`). Use type helpers from `src/typecheck.ts` (`isBool`, `isInteger`, `typeOf`, `typesEqual`) and value helpers from `src/value.ts` (`isTruthy`, `requireNumber`) rather than `typeof` checks.
- **Integer types have overflow/underflow checks.** `makeInteger` throws on out-of-range values. Typed arithmetic preserves the operand's type and re-checks bounds.
- **Errors are thrown** (plain `Error` with descriptive messages) — the interpreter has no error-return type. Tests assert with `.toThrow()`.
- **Type annotations are optional** (`let x : U8 = …`, `fn f() : I32 => …`) and are validated at runtime.
- **`noUncheckedIndexedAccess` is on** — array/map indexing returns `T | undefined`; use non-null assertions (`!`) or guards as the existing code does.

## Pitfalls

- Don't add new source files without wiring them into the pipeline in `index.ts` and adding a test.
- Keep operator logic in `src/operators.ts` tables rather than inline in the evaluator — this is what CPD checks for.
- When adding a new AST node type, update `AST` in `src/types.ts`, the parser, and the evaluator's `switch` together.
- **Struct type definitions are stored as `StructTypeValue` (kind `"structType"`), NOT `StructTypeName`** — `StructTypeName` is a type, not a `Value`, so it can't live in the environment. `typeOf` returns `undefined` for functions; guard with `actual !== undefined && typesEqual(...)` before comparing (a `?? "I32"` fallback makes `f is I32` wrongly return `true`).
- **Struct field types carry a `mutable` flag**: `Record<string, { typeName: TypeName; mutable: boolean }>`. `fieldAssign` must look up the struct type and check the field's flag before mutating, or immutable fields are silently writable.
- **`parseStructLiteral` must NOT consume the `{` itself** — `parseStructFields` does. Likewise `parseStructFields` must consume a leading `mut` prefix *before* the field name token.
- **`assignOps` `Record` type excludes `"="`** — compound-assign helpers must type their operator param as `"+=" | "-=" | "*=" | "/="` (not include `"="`) or `tsc` errors.
- **CPD rejects duplicated logic** (array lookup, compound assignment, struct field lookup, brace consumption). When adding a feature that mirrors an existing one, extract a shared helper (e.g. `resolveIndex`, `resolveField`, `consumeOpenBrace`) rather than copying code.
