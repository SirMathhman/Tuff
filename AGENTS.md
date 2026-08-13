# Tuff — Agent Instructions

Tuff is a custom programming language interpreter written in TypeScript, run with Bun.

## Commands

| Command             | Action                                       |
| ------------------- | -------------------------------------------- |
| `bun test`          | Run tests (`--coverage`)                     |
| `bun run typecheck` | TypeScript type check                        |
| `bun run lint`      | ESLint with auto-fix                         |
| `bun run cpd`       | Copy-paste detection (PMD)                   |
| `bun run circular`  | Circular dependency check (madge)            |
| `bun run visualize` | Generate dependency graph (`docs/graph.svg`) |

## Architecture

Classic compiler pipeline: `Source → Tokenizer → Parser → Type Checker → Evaluator → Result`

| File                  | Role                                                                           |
| --------------------- | ------------------------------------------------------------------------------ |
| `src/index.ts`        | Entry — `evaluate(source: string): number`                                     |
| `src/tokenizer.ts`    | Regex-based lexer; produces tuple tokens `[kind, value]`                       |
| `src/parser.ts`       | Recursive descent parser; produces `AstNode[]`                                 |
| `src/ast.ts`          | Discriminated union AST types                                                  |
| `src/type-checker.ts` | Validates integer range/signedness                                             |
| `src/evaluator.ts`    | Interpreter — `evaluate()` (returns `number`), `evalValue()` (returns `Value`) |
| `src/eval-helpers.ts` | Shared eval utilities — `evalRange`, `getIndex`, `evalLiteral`, etc.           |
| `src/environment.ts`  | Symbol table with scoping, mutability, refs                                    |
| `src/control-flow.ts` | `Break` / `Continue` / `Yield` / `Return` Error subclasses                     |
| `src/types.ts`        | Integer type definitions (`u8`, `i32`, …) and promotion rules                  |

## Conventions

- **No external runtime dependencies** — only `bun:test` and dev tools
- **Strict TypeScript** — `strict: true`, `noUncheckedIndexedAccess`, `noImplicitOverride`
- **Error handling** — throw `Error` with descriptive messages; control flow via `Break`/`Continue`/`Yield`/`Return` subclasses
- **Dual eval paths** — `evaluate()` returns `number` (top-level); `evalValue()` returns `Value` (internal). `Value` is a discriminated union with kinds: `number`, `bool`, `null`, `ref`, `array`, `range`, `struct`, `tuple`, `fnref`
- **Tuple tokens** — tokenizer uses `[kind, value]` tuples, not objects
- **Naming** — camelCase functions/variables, PascalCase classes, SCREAMING_SNAKE_CASE constants
- **Tests** — single file (`test/index.test.ts`); descriptive names showing source and expected result (e.g. `evaluate("1 + 2") => 3`); `.toThrow()` for errors

## Language Features

Typed integers (`u8`, `u16`, `i8`, `i16`, `i32`), floating point (`f32`, `f64`), characters (`char`), strings (`str`), booleans, `let` / `let mut`, references (`&x`, `&mut x`, `*y`), `if/else` (statement and expression), `while`, `for (in range)`, `break`/`continue`, structs (nested types), fixed-length arrays, multi-dimensional indexing, compound assignment (`+=`, `-=`), functions (`fn` with type annotations), function references, type aliases, runtime type checks (`is`), casts, blocks as expressions, type promotion.

## See Also

- [Missing Features](docs/missing-features.md) — feature comparison matrix (Tuff vs Rust/TS/Kotlin)
