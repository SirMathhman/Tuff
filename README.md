# tuff

A small TypeScript (Bun) library that evaluates a Rust-like source subset into a process exit code.

## Install

```bash
bun install
```

## Usage

```ts
import { evaluate } from "tuff";

evaluate("let mut x = 1; x += 2; return x;"); // Ok(3)
evaluate("let x = 1; x = 2; return x;"); // Err (mutability: assignment to immutable binding)
```

`evaluate(input: string): Result<number, EvalError>` returns the exit code, not an internal value. Coercion at the return boundary is explicit and total: number → itself, boolean → `1`/`0`, ref or array → error.

### Language subset

- `let` / `let mut` bindings (optional type annotations, e.g. `let x: i32 = 5;`)
- `=` / `+=` assignment
- `if` / `else`, `while`, blocks `{}`
- `&` / `&mut` references, `*` dereference (including `*x = v`)
- Array literals `[1, 2, 3]` and indexing `a[i]`
- Integer literals with suffixes (`U8`…`I64`, `USize`, `ISize`)
- Comparison (`<`, …) and arithmetic expressions
- Trailing `return`

### Errors

Every `EvalError` carries `kind`, `message`, `position` (line/column), and `snippet`. Kinds: `syntax` (lexer/parser), `semantic` (type/binding/borrow rules), `mutability` (immutability violations), `runtime` (undefined variables, missing return).

## Development

See [AGENTS.md](./AGENTS.md) for commands, architecture, and conventions.

```bash
bun test          # tests (coverage auto-on)
bun run lint      # type check + eslint --fix + size limits
bunx prettier --check .
```
