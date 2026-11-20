# Architecture

Tuff is a small TypeScript project run with [Bun](https://bun.com). It is an interpreter for the Tuff language, and it is at an early stage: a program is zero or more `let NAME = value;` statements followed by an expression. Supported: integers, variables (letters only), `+`, `-`, `*`, signs, parenthesized and braced groups, with `*` binding tighter than `+` and `-`. A brace pair opens a block scope.

## Layout

| File                                  | Role                                                                                                                                                                                                                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `index.ts`                            | Entry module. Exports `interpretTuff` only; the result and error types are internal.                                                                                                                                                                               |
| `scripts/unused-exports.ts`           | Checks that no export goes unused by other project files, using the TypeScript compiler API. Run as part of `bun run lint`.                                                                                                                                        |
| `eslint-rules/no-recursion.js`        | Custom ESLint rule. Reports functions that can reach themselves through direct calls in their file. Recursion that closes only through a parameter is allowed.                                                                                                     |
| `repl.ts`                             | Interactive read-eval-print loop. Reads lines from stdin, evaluates each with `interpretTuff`, and prints the value or the error. Started with `bun run repl`.                                                                                                     |
| `index.test.ts`                       | Tests using Bun's built-in `bun:test` runner.                                                                                                                                                                                                                      |
| `eslint.config.js`                    | ESLint configuration: recommended JavaScript and TypeScript rules, the `local/no-recursion` rule, JSDoc requirements, `id-length` (names of at least two characters), `max-lines-per-function`, and restricted syntax.                                             |
| `package.json`                        | Project metadata and the `lint`, `repl`, `format`, and `format:check` scripts. Declares `@types/bun`, `@eslint/js`, `eslint`, `eslint-plugin-jsdoc`, `prettier`, `typescript-eslint`, and `typescript` as dev dependencies, and `typescript` as a peer dependency. |
| `tsconfig.json`                       | TypeScript configuration.                                                                                                                                                                                                                                          |
| `.gitignore`, `README.md`, `bun.lock` | Repository support files.                                                                                                                                                                                                                                          |

Dependency direction: `repl.ts` and `index.test.ts` depend on `index.ts`. `index.ts` depends on no project file and performs no I/O. `scripts/` and `eslint-rules/` depend on no runtime file. No project file may import `repl.ts`, and no import cycle may exist between project files.

## Definitions

- **Expression:** terms joined by `+` or `-`. A term is factors joined by `*`. A factor is an optional sign followed by an integer, a variable, or a parenthesized or braced expression. A sign may follow a binary operator, so `1 - -2`, `2 * -3`, and `-(2 + 3)` are valid.
- **Statement:** `let NAME = expression;`. A name is one or more ASCII letters, and `let` itself cannot be a name. A `let` is visible in the block where it appears, including blocks nested in it. A `let` of a name already declared in the same block replaces that value silently.
- **Block:** a `{ ... }` pair. Its value is its final expression, so a block cannot end with a `let`.
- **Result:** `{ ok: true, value }` (a `Success`) on success or `{ ok: false, error }` (a `Failure`) on failure.
- **TuffError:** a four-part description of a syntax error:
  - `what`: the error, for example `Expected '+', '-', or '*' but found 'x'`.
  - `where`: the zero-based offset into the original source string.
  - `why`: the rule that was broken.
  - `fix`: how to correct the source.

## Components

### `interpretTuff(tuffSource: string): Result<number, TuffError>`

A shunting-yard evaluator with explicit stacks, written as one loop with no recursion. It reads the original source with character checks (no regular expressions) and skips whitespace. A sign must touch its digits or its opening bracket. Whitespace is allowed around operators.

- A value stack holds numbers. An operator stack holds pending `+`, `-`, `*` operators and open-group entries. Each group entry remembers the sign written before its opening bracket and which kind of bracket it is.
- Operands are read directly. A pending operator is applied first when it binds at least as tightly (`*` above `+` and `-`), which makes operators left-associative.
- `)` applies pending operators back to the group entry, then scales the group's value by its sign.
- A `let` pushes a binding entry until its `;`, then stores the value in the current scope. A `{` pushes a scope that is popped at its `}`. A name is looked up from the innermost scope outwards.
- Nesting depth is limited only by memory, not by the call stack.

Errors:

- No digits, no name, and no opening bracket where a factor is expected: `Expected a number, a variable, '(', or '{'`.
- A character after a term that is not an operator (or a closing bracket inside brackets): `Expected '+', '-', or '*'` at top level, or `Expected '+', '-', '*', ')', or '}'` inside brackets.
- Input ends inside brackets: `Expected ')'` or `Expected '}'`, matching the innermost opening bracket.
- A name that is not declared in any enclosing scope: `Name 'x' is not defined`.
- A `let` with no name, a keyword as its name, no `=` after the name, or no `;` after its value has its own message. A `let` that is not at the start of a statement, such as inside parentheses or after an operator, reports that `let` is only allowed at the start of a statement. A `;` outside a `let` is `Unexpected ';' outside a let statement`.

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
- `interpretTuff("1 + x")` returns an error at offset 4: `what` is `Name 'x' is not defined`.
- `interpretTuff("")` returns an error at offset 0: `what` is `Expected a number, a variable, '(', or '{' but found the end of the input`.
- `interpretTuff("(2 + 3")` returns an error at offset 6: `what` is `Expected ')' but found the end of the input`.
- `interpretTuff("{ 2 + 3 } * 4")` returns `{ ok: true, value: 20 }`.
- `interpretTuff("(2 + 3 }")` returns an error at offset 7: `what` is `Expected ')' to close '(' but found '}'`.
- `interpretTuff("{ let x = 2 + 3; x } * 4")` returns `{ ok: true, value: 20 }`.
- `interpretTuff("let x = 1;")` returns `{ ok: true, value: 0 }`.
- `interpretTuff("{ let x = 1; }")` returns an error at offset 13: a block cannot end with a `let`.
- `interpretTuff("{ let x = 1; x } + x")` returns an error at offset 19: `what` is `Name 'x' is not defined`, because `x` is out of scope.

### REPL (`repl.ts`)

Reads one expression per line. Blank lines are skipped, and `exit` quits. A value prints as the number; an error prints as `error: <what> (at offset <where>)`. The REPL does not print `why` or `fix`.

## Testing

Run `bun test`. Each feature has a test named after the expression and its expected result, for example `interpretTuff("1 + 2") => 3`. Error tests check all four fields.

## Known gaps and open decisions

- **Operators:** `+`, `-`, and `*` are supported, and only between integers, variables, and parenthesized or braced groups. Division, assignment outside `let`, functions, and names with digits or underscores are not implemented.
- **Linting:** `bun run lint` runs ESLint (recommended JavaScript and TypeScript rules, the `local/no-recursion` rule, and restricted syntax) and then `scripts/unused-exports.ts`. The recursion rule counts direct calls (by name, through aliases, and as methods `x.name(...)`) and closures nested in a function. Recursion that closes only through a parameter is allowed, and passing a function as an argument is not an edge. The rule works within one file, so recursion that crosses files is not detected. Calls through object properties and `this` (`o.m()`, `this.m()`) are matched to methods by name only, so two unrelated objects with a method of the same name can produce a false positive. Aliases (`const g = f`) are followed. Known gaps: methods with computed keys (`o["m"]()`) are not matched. `no-restricted-syntax` bans regex literals, `RegExp` construction or calls, `match`/`matchAll`/`search` calls, and object type literals (use named interfaces instead), and string literal types (use enums instead). The unused-export check fails if any export is not imported or re-exported by another project file, so the export keyword must be removed. Functions longer than 100 lines (blank lines and comments excluded) are reported by `max-lines-per-function`. Exported top-level functions, classes, interfaces, type aliases, and enums must have JSDoc; exported functions must document every `@param` name and have a `@returns` entry (`jsdoc/require-jsdoc`, `jsdoc/require-param`, `jsdoc/require-returns`). Files longer than 500 lines (blank lines and comments excluded) are reported by `max-lines`. The files-per-directory limit is not enforced by lint. Identifiers must be at least two characters long (`id-length`).

## Potential Problems

- **Integer precision:** numbers are parsed with `parseInt` into JavaScript doubles. Values above `Number.MAX_SAFE_INTEGER` are silently rounded, so `9007199254740993 + 0` returns `9007199254740992` with `ok: true`. The result is wrong without any error.
- **Overflow is unreported:** the sum can exceed the double range or lose precision without any `TuffError`. A literal of 400 digits parses to `Infinity` with `ok: true`.
- **Negative zero:** `interpretTuff("-0")` returns `-0` with `ok: true`, and the REPL prints `-0`. `Object.is` distinguishes it from `0`, so equality checks on results can disagree with arithmetic expectations.

## Security Concerns

`interpretTuff` takes input only from its caller as a string. It performs no I/O, no network access, and no evaluation of host code, so it has no prompt-injection, data-exposure, or unauthenticated state-change surface today. The REPL, which reads stdin, is covered below.

The ideal architecture keeps these rules as the project grows:

- Source text is untrusted. It must never be passed to `eval`, `Function`, or a shell.
- Input length must be bounded before it is scanned. The current scanner has no length limit. Control: a maximum source length, returned as a `TuffError`.
- Nesting depth must not exhaust the call stack. Control in place: the parser uses explicit stacks, so nesting costs memory, not call frames. Gap: deeply nested input can still use a lot of memory; no maximum depth is enforced.
- The REPL is the only path where untrusted text reaches the interpreter: each stdin line is read without a length limit and passed straight to `interpretTuff`. Control: the same maximum source length applies, enforced in `interpretTuff`. Gap: not yet implemented.
- Any future I/O (file reads, module imports, network) sits behind an explicit capability parameter, so `interpretTuff` stays pure. Gap: none of these exist yet.

## Future Work

- Split the pipeline into `lexer`, `parser` (producing an AST), and `evaluator`, each in its own file, with `interpretTuff` as the composition point. The combined shunting-yard evaluator is a stopgap until that split exists.
- Replace `number` with `bigint` (or a decimal type) so arithmetic is exact. This also resolves the precision issue above.
- Report line and column in addition to the offset in `where`.
- Check the 10-files-per-directory limit by hand, since ESLint has no rule for it.

## Performance

- The single-pass scan is linear in source length, so performance is acceptable for expressions of typical size.
- A very long digit run is parsed with one `parseInt`. This is fine for the current input size but gives no meaningful result past the safe-integer limit.
- No profiling has been done. Measure with a profiler before optimizing.
