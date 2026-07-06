# Tuff — Agent Guidelines

## Build and Test

| Command               | Purpose                                  |
| --------------------- | ---------------------------------------- |
| `bun test`            | Run tests                                |
| `bun test --coverage` | Run tests with coverage (threshold: 95%) |

Coverage output is in `./coverage/lcov.info`. A `.github/hooks/hooks.json` runs tests automatically at session Stop.

## Architecture

Single-file compiler in `index.js` that translates Tuff source to executable JavaScript via `new Function()`.

**Tuff Language Features:**

- `read()` — reads next integer from space-separated stdin
- Arithmetic expressions: `+`, `-`, `*`, `/`, parentheses
- `{ }` blocks — scoped statement groups evaluating to the last expression
- `let x = expr;` — variable declaration
- Statements separated by `;`; top-level braces `{}` are respected for nesting

**Compilation Pipeline:**

1. `splitStatements()` — splits source by `;`, respecting `{}` depth
2. `compileStatement()` → `compileExpression()` — validates and transforms each statement
3. `validateExpression()` — whitelist check (numbers, operators, `read()`, known vars)
4. Output wraps in a JS function with `__read()` injected for input

## Conventions

- **Result pattern**: `ok(value)` / `err(message)` — never throw for compilation errors
- **Tests avoid `throws`**: use custom assertion helpers (`assertValid`, `assertInvalid`) instead of `expect(...).toThrow()`
- **No external dependencies**: pure JS, no linter or formatter configured
