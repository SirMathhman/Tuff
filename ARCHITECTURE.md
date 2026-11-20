# Architecture

Tuff is a small TypeScript project run with [Bun](https://bun.com). It is an interpreter for the Tuff language, and it is at an early stage: the only supported expression is a sum, difference, or product of integers and parenthesized groups, with `*` binding tighter than `+` and `-`.

## Layout

| File | Role |
| --- | --- |
| `index.ts` | Entry module. Exports `interpretTuff`, `Result`, `Success`, `Failure`, `Parsed`, and `TuffError`. |
| `repl.ts` | Interactive read-eval-print loop. Reads lines from stdin, evaluates each with `interpretTuff`, and prints the value or the error. Started with `bun run repl`. |
| `index.test.ts` | Tests using Bun's built-in `bun:test` runner. |
| `eslint.config.js` | ESLint configuration (recommended JavaScript and TypeScript rules, plus restricted syntax). |
| `package.json` | Project metadata and the `lint` and `repl` scripts. Declares `@types/bun`, ESLint, and `typescript` as dev dependencies, and `typescript` as a peer dependency. |
| `tsconfig.json` | TypeScript configuration. |
| `.gitignore`, `README.md`, `bun.lock` | Repository support files. |

## Definitions

- **Expression:** terms joined by `+` or `-`. A term is factors joined by `*`. A factor is an optional sign followed by either an integer or a parenthesized expression. A sign may follow a binary operator, so `1 - -2`, `2 * -3`, and `-(2 + 3)` are valid.
- **Result:** `{ ok: true, value }` (a `Success`) on success or `{ ok: false, error }` (a `Failure`) on failure.
- **TuffError:** a four-part description of a syntax error:
  - `what`: the error, for example `Expected '+', '-', or '*' but found 'x'`.
  - `where`: the zero-based offset into the original source string.
  - `why`: the rule that was broken.
  - `fix`: how to correct the source.

## Components

### `interpretTuff(tuffSource: string): Result<number, TuffError>`

A recursive-descent parser over the original source, using character checks (no regular expressions) and skipping whitespace. A sign must touch its digits or its `(`. Whitespace is allowed around operators.

1. `parseExpression(source, start, depth)` parses terms joined by `+` or `-`, starting from `0`. At `depth > 0` (inside parentheses) it stops at `)`. A group that would exceed `MAX_NESTING_DEPTH` (256) returns the error "Parentheses are nested more than 256 levels deep" at the offending `(`, instead of exhausting the call stack.
2. `parseTerm` parses factors joined by `*`.
3. `parseFactor` reads an optional sign, then either digits or a parenthesized group. It reaches the group through a `GroupParser` parameter that `parseExpression` supplies, so `parseFactor` and `parseTerm` never call `parseExpression` directly. The recursion is confined to `parseExpression`.

Errors:

- No digits and no `(` where a factor is expected: "Expected a number or '('".
- A character after a term that is not an operator (or `)` inside parentheses): "Expected '+', '-', or '*'" at top level, or "Expected '+', '-', '*', or ')'" inside parentheses.
- Input ends inside parentheses: "Expected ')'".

Behavior:

- `interpretTuff("5")` returns `{ ok: true, value: 5 }`.
- `interpretTuff("1 + 2")` returns `{ ok: true, value: 3 }`.
- `interpretTuff("2 + 3 - 4")` returns `{ ok: true, value: 1 }`.
- `interpretTuff("1 - -2")` returns `{ ok: true, value: 3 }`.
- `interpretTuff("2 * 3 + 4")` returns `{ ok: true, value: 10 }`.
- `interpretTuff("2 + 3 * 4")` returns `{ ok: true, value: 14 }`.
- `interpretTuff("(2 + 3) * 4")` returns `{ ok: true, value: 20 }`.
- `interpretTuff("-(2 + 3) * 4")` returns `{ ok: true, value: -20 }`.
- `interpretTuff("2x")` returns an error at offset 1: `what` is `Expected '+', '-', or '*' but found 'x'`.
- `interpretTuff("1 + x")` returns an error at offset 4: `what` is `Expected a number or '(' but found 'x'`.
- `interpretTuff("")` returns an error at offset 0: `what` is `Expected a number or '(' but found the end of the input`.
- `interpretTuff("(2 + 3")` returns an error at offset 6: `what` is `Expected ')' but found the end of the input`.

### REPL (`repl.ts`)

Reads one expression per line. Blank lines are skipped, and `exit` quits. A value prints as the number; an error prints as `error: <what> (at offset <where>)`. The REPL does not print `why` or `fix`.

## Testing

Run `bun test`. Each feature has a test named after the expression and its expected result, for example `interpretTuff("1 + 2") => 3`. Error tests check all four fields.

## Known gaps and open decisions

- **Operators:** `+`, `-`, and `*` are supported, and only between integers and parenthesized groups. Division and other operators are not implemented.
- **Linting:** ESLint with the recommended JavaScript and TypeScript rules runs via `bun run lint`. `no-restricted-syntax` bans regex literals, `RegExp` construction or calls, `match`/`matchAll`/`search` calls, and object type literals (use named interfaces instead). The project size limits are not enforced by lint.

## Potential Problems

- **Integer precision:** numbers are parsed with `parseInt` into JavaScript doubles. Values above `Number.MAX_SAFE_INTEGER` are silently rounded, so `9007199254740993 + 0` returns `9007199254740992` with `ok: true`. The result is wrong without any error.
- **Overflow is unreported:** the sum can exceed the double range or lose precision without any `TuffError`. A literal of 400 digits parses to `Infinity` with `ok: true`.
- **Stack overflow on deep nesting:** each `(` adds several call frames (`parseExpression`, `parseTerm`, `parseFactor`, and the group closure). About 20,000 nested parentheses throw `RangeError: Maximum call stack size exceeded`. The exception escapes `interpretTuff` instead of returning a `TuffError`, which breaks the no-exceptions rule and would propagate out of the REPL's line handler.

## Security Concerns

Tuff currently takes input only from its caller as a string. It performs no I/O, no network access, and no evaluation of host code, so it has no prompt-injection, data-exposure, or unauthenticated state-change surface today.

The ideal architecture keeps these rules as the project grows:

- Source text is untrusted. It must never be passed to `eval`, `Function`, or a shell.
- Input length must be bounded before it is scanned. The current scanner has no length limit. Control: a maximum source length, returned as a `TuffError`.
- Nesting depth must be bounded. The recursive parser has no depth limit, so hostile input can exhaust the call stack. Control: a maximum parenthesis depth, returned as a `TuffError` at the offending `(`. Gap: none exists yet.
- Any future I/O (file reads, module imports, network) sits behind an explicit capability parameter, so `interpretTuff` stays pure. Gap: none of these exist yet.

## Future Work

- Split the pipeline into `lexer`, `parser` (producing an AST), and `evaluator`, each in its own file, with `interpretTuff` as the composition point. The current single-pass scanner is a stopgap.
- Replace call-stack recursion with an explicit-stack parser (for example shunting-yard) so nesting depth is limited by a documented `TuffError`, not by the JavaScript call stack.
- Replace `number` with `bigint` (or a decimal type) so arithmetic is exact. This also resolves the precision issue above.
- Report line and column in addition to the offset in `where`.
- Enforce the project size limits (100 lines per function, 500 code lines per file) in the ESLint configuration. ESLint has no rule for the 10-files-per-directory limit, so check that by hand.

## Performance

- The single-pass scan is linear in source length, so performance is acceptable for expressions of typical size.
- A very long digit run is parsed with one `parseInt`. This is fine for the current input size but gives no meaningful result past the safe-integer limit.
- No profiling has been done. Measure with a profiler before optimizing.
