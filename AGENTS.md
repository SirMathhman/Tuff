# Tuff Language Interpreter

A test-driven recursive-descent interpreter for the Tuff language, built incrementally with one test per feature.

## Commands

| Command | Purpose |
|---|---|
| `npm test` | Run all tests (Bun test framework) |
| `npm run lint` | Run ESLint with auto-fix |

## Architecture

- **`index.ts`** — Single-file interpreter: tokenizer, parser, scope manager, and executor.
- **`index.test.ts`** — Test suite. One test per feature, format: `interpret("...") => expected`.

### Core Flow
`interpret(source)` -> `tokenize()` -> statement loop (`processStatement`) -> returns last expression value (or `0`).

### Grammar Hierarchy (highest to lowest precedence)
`parseOrExpression` (`||`) -> `parseAndExpression` (`&&`) -> `parseExpression` (`+`, `-`) -> `parseTerm` (`*`, `/`) -> `parseFactor` (numbers, identifiers, booleans, parenthesized expressions)

### Scope Model
Stack of `{ env: Record<string, number>, mutable: Set<string> }`. Block `{}` pushes/pops. Lookup walks innermost -> outermost. `let mut` adds to `mutable` set; assignment requires mutable flag.

### Skip Logic
Unexecuted branches (skipped `if` then-branch, skipped `else` body) use `skipStatement` family to advance token position without evaluation. Must handle nested `{}`, `if/else`, and `()` correctly.

## Conventions

- **TDD workflow**: User provides `interpret("...") => expected`, agent adds test, runs `npm test`, fixes implementation if needed.
- **ESLint complexity rule**: Max complexity `10`. Refactor into small helpers when approaching limit.
- **Boolean semantics**: `true` -> `1`, `false` -> `0` internally. Logical operators use JS `||`/`&&` on numeric values.
- **Result semantics**: Last expression statement's value is returned. Declarations and assignments return `0`.

## Known Pitfalls

- Parser queue gotcha: if parser emits queued statements (syntax-lowering), EOF loops must drain the queue or trailing declarations are silently dropped.
- ASI gotcha: Never format dynamically generated JS with a newline after `return`.
