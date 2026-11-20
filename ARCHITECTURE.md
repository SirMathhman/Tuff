# Architecture

Tuff is a small TypeScript project run with [Bun](https://bun.com). It is an interpreter for the Tuff language, and it is at an early stage: the only supported expression is a sum or difference of integers.

## Layout

| File | Role |
| --- | --- |
| `index.ts` | Entry module. Exports `interpretTuff`, `Result`, and `TuffError`. |
| `index.test.ts` | Tests using Bun's built-in `bun:test` runner. |
| `package.json` | Project metadata. Declares `@types/bun` as a dev dependency and `typescript` as a peer dependency. |
| `tsconfig.json` | TypeScript configuration. |
| `.gitignore`, `README.md`, `bun.lock` | Repository support files. |

## Definitions

- **Expression:** an optional leading sign, then integers joined by `+` or `-`. A sign may follow a binary operator, so `1 - -2` is valid.
- **Result:** `{ ok: true, value }` on success or `{ ok: false, error }` on failure.
- **TuffError:** `{ kind: "InvalidSyntax", source }`, returned when the source is not an expression.

## Components

### `interpretTuff(tuffSource: string): Result<number, TuffError>`

1. Trims the source, then scans it left to right with character checks (no regular expressions). A sign must touch its digits. Whitespace is allowed around binary operators. Anything that does not fit the grammar returns `InvalidSyntax`.
2. Each number takes its sign from the binary operator before it and any unary sign directly before its digits. The sum starts at `0`.

Behavior:

- `interpretTuff("5")` returns `{ ok: true, value: 5 }`.
- `interpretTuff("1 + 2")` returns `{ ok: true, value: 3 }`.
- `interpretTuff("2 + 3 - 4")` returns `{ ok: true, value: 1 }`.
- `interpretTuff("1 - -2")` returns `{ ok: true, value: 3 }`.
- `interpretTuff("2x")`, `interpretTuff("1.9 + 1")`, `interpretTuff("1 + x")`, and `interpretTuff("")` return `{ ok: false, error: { kind: "InvalidSyntax", source } }`.

## Testing

Run `bun test`. Each feature has a test named after the expression and its expected result, for example `interpretTuff("1 + 2") => 3`.

## Known gaps and open decisions

- **Error detail:** `InvalidSyntax` only reports the whole source. It does not identify which operand is wrong.
- **Operators:** only `+` and `-` are supported, and only between integers. Multiplication and grouping are not implemented.
- **Linting:** ESLint with the recommended JavaScript and TypeScript rules runs via `bun run lint`. `no-restricted-syntax` bans regex literals, `RegExp` construction or calls, `match`/`matchAll`/`search` calls, and object type literals (use named interfaces instead). The project size limits are not enforced by lint.

## Potential Problems

- **Integer precision:** numbers are parsed with `parseInt` into JavaScript doubles. Values above `Number.MAX_SAFE_INTEGER` are silently rounded, so `9007199254740993 + 0` returns `9007199254740992` with `ok: true`. The result is wrong without any error.
- **Overflow is unreported:** the sum can exceed the double range or lose precision without any `TuffError`.
- **Error detail:** see Known gaps. A failing source gives no position.

## Security Concerns

Tuff currently takes input only from its caller as a string. It performs no I/O, no network access, and no evaluation of host code, so it has no prompt-injection, data-exposure, or unauthenticated state-change surface today.

The ideal architecture keeps these rules as the project grows:

- Source text is untrusted. It must never be passed to `eval`, `Function`, or a shell.
- Input length must be bounded before it is scanned. The current regex has no length limit. Control: a maximum source length, returned as a structured error.
- Any future I/O (file reads, module imports, network) sits behind an explicit capability parameter, so `interpretTuff` stays pure. Gap: none of these exist yet.

## Future Work

- Split the pipeline into `lexer`, `parser` (producing an AST), and `evaluator`, each in its own file, with `interpretTuff` as the composition point. The current single-pass scanner is a stopgap.
- Replace `number` with `bigint` (or a decimal type) so arithmetic is exact. This also resolves the precision issue above.
- Report error positions: `TuffError` carries the offset and the offending token.
- Enforce the project size limits (100 lines per function, 500 code lines per file) in the ESLint configuration. ESLint has no rule for the 10-files-per-directory limit, so check that by hand.
- Add multiplication, grouping, and an error-context field.

## Performance

- The single-pass scan is linear in source length, so performance is acceptable for expressions of typical size.
- A very long digit run is parsed with one `parseInt`. This is fine for the current input size but gives no meaningful result past the safe-integer limit.
- No profiling has been done. Measure with a profiler before optimizing.
