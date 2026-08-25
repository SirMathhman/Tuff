# tuff

A small TypeScript library (Bun runtime) that evaluates user-supplied code strings against a fixed, sandboxed language subset. It is **not** a general-purpose evaluator.

## Install & run

```bash
bun install
bun test        # run the test suite
bun run lint    # eslint
```

## API

```ts
import { evaluate } from "tuff";

type Result<T> = { ok: true; value: T } | { ok: false; error: EvaluateError };

function evaluate(input: string): Result<number>;
```

`evaluate` never throws. It returns a `Result<number>`:

- **`{ ok: true, value }`** — the numeric result. An empty string evaluates to `0`. A program with no `return` evaluates to `0`.
- **`{ ok: false, error }`** — a structured `EvaluateError` (a closed enum of variants, each carrying a `position` character offset plus the relevant cause field). No prose strings, no exceptions.

### The `Result<number>` boundary

Internally the value model is `number | boolean`. Booleans are coerced to `0`/`1` **only at the `evaluate` boundary** — the single point where a boolean becomes a number. This keeps the internal value model honest while the public API stays numeric:

```ts
evaluate("return true;"); // { ok: true, value: 1 }
evaluate("return false;"); // { ok: true, value: 0 }
```

## Trust model

The interpreter is sandboxed **by construction**: it executes a typed AST produced by the lexer and parser, and the language subset has no escape hatches. There is no `eval`, no `new Function`, no access to the host environment, no I/O, and no way to construct or invoke arbitrary functions. These constraints are enforced by lint (`no-eval`, `no-new-func`).

Consumers should not assume a general-purpose evaluator: only the constructs below are supported, and anything else is rejected with a structured error.

## Language subset

### Types

Two types: `number` and `boolean`.

- **number literals**: `0`, `1.5` (integers and decimals; malformed literals like `1.2.3` or `1.` are rejected).
- **boolean literals**: `true`, `false`.

### Variables

- `let x = <expr>;` — declare an immutable binding.
- `let mut x = <expr>;` — declare a mutable binding.
- Re-declaring a name rebinds it to the new value and mutability (e.g. `let x = 0; let x = 1;` yields `1`).
- Assigning to an immutable binding is an error (`ImmutableReassignment`).
- Reassigning a binding to a value of a different type is an error (`TypeMismatch`).

### Statements

- **Assignment**: `x = <expr>;` and `x += <expr>;` (`+=` requires number operands).
- **Return**: `return <expr>;` — the first `return` produces the result; execution stops there.
- **Block**: `{ <statements> }`.
- **If**: `if (<expr>) { <statements> } else { <statements> }` (the `else` is optional).
- **While**: `while (<expr>) { <statements> }`.

### Operators

| Operator | Meaning             | Result type |
| -------- | ------------------- | ----------- |
| `\|\|`   | logical or          | boolean     |
| `&&`     | logical and         | boolean     |
| `<`      | less-than (numbers) | boolean     |
| `==`     | equality            | boolean     |

Operators chain and nest; expressions may be parenthesized.

### Scoping

Blocks share a single flat binding environment: a `let` inside a block is visible outside it. There is no block scoping.

## Error variants

`EvaluateError` is a closed set. Every variant identifies the cause in the source via a `position` (character offset) plus a relevant field:

`EmptyInput`, `UnexpectedCharacter`, `UnsupportedExpression`, `UndeclaredVariable`, `ExpectedToken`, `EmptyStatement`, `MissingTerminator`, `ImmutableReassignment`, `UnbalancedBrace`, `UnbalancedParen`, `InvalidNumberLiteral`, `TypeMismatch`.

## Pipeline

`evaluate` orchestrates four stages, each a single-entry module communicating through typed intermediate representations:

```
tokenize (lexer) → groupStatements (parser) → typecheck → interpret
```

- **lexer** — tokenizes input and validates number literals at lex time.
- **parser** — a cursor-based recursive-descent parser that produces a typed AST (statements + expressions).
- **typecheck** — a static pass that validates all branches (including ones that would not execute): it detects `UndeclaredVariable` and `TypeMismatch` on `=` assignments.
- **interpreter** — executes the AST against a binding environment, producing the value.
