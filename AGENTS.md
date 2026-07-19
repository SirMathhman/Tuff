# Tuff — Expression Evaluator

Progressively capable expression evaluator with a recursive descent parser.

## Commands

```bash
bun test        # Run tests (Bun test framework)
npm run lint    # ESLint (complexity ≤ 10, no-useless-escape)
npm run cpd     # PMD CPD duplication check (min 50 tokens)
```

## Development Workflow

1. Add failing test to `index.test.js`
2. Implement minimal change in `index.js`
3. Run `bun test` — all tests must pass
4. Run `npm run lint` — no lint errors
5. Commit with descriptive message

## Architecture

- **`evaluate(source, scope)`** — Entry point. Returns `0` for empty string.
- **Tokenizer** — Regex-based, splits on whitespace after normalizing operators. Uses `new RegExp()` to avoid `no-useless-escape`.
- **Parser** — Recursive descent with `parseOrExpr` → `parseAndExpr` → `parseComparison` → `parseExpr` → `parseTerm` → `parseFactor`.
- **`TypedValue`** — Wraps values with type info: `{ value, type }`.
- **`unwrap()`** — Extracts plain value from `TypedValue`.
- **`scopeStack`** — Array of `{ vars, mutVars }` objects for block scoping.
- **Assignments return `0`** — Not the assigned value.

## Type System

- Typed literals: `100U8`, `100U16`, `100U32`, `100I8`, `100I16`, `100I32`
- Typed variables: `let x : U8 = 100`
- Arrays: `[Type; N]` syntax, e.g., `[U8; 3]`
- Structs: `struct Name { field : Type, mut field : Type }`
- Struct instances: `Name { field : value }`
- Mutable struct fields require `mut` in definition AND `let mut` on instance

## Keywords

`let`, `mut`, `if`, `else`, `while`, `fn`, `struct`, `true`, `false`

## Common Pitfalls

- Parser queue: EOF loops must drain queued statements
- ASI: Never format generated JS with `return \n` — treated as `return;`
- Tokenizer splits `.` so `w.field` becomes `w`, `.`, `field` — handle in `isAssignment`/`parseAssignment`
- ESLint `new RegExp()` required to avoid `no-useless-escape` errors
