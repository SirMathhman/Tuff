# Architecture

Tuff is a small TypeScript project run with [Bun](https://bun.com). It is an interpreter for the Tuff language, and it is at an early stage: the only supported expression is a sum of integers.

## Layout

| File | Role |
| --- | --- |
| `index.ts` | Entry module. Exports `interpretTuff(tuffSource: string): number`. |
| `index.test.ts` | Tests using Bun's built-in `bun:test` runner. |
| `package.json` | Project metadata. Declares `@types/bun` as a dev dependency and `typescript` as a peer dependency. |
| `tsconfig.json` | TypeScript configuration. |

## Components

### `interpretTuff`

Takes a source string and returns a number.

- Removes all whitespace from the source.
- Extracts every signed integer term with `/[+-]?\d+/g`.
- Parses each term with `parseInt(term, 10)` and sums them, starting from `0`.

Current behavior:

- `interpretTuff("5")` returns `5`.
- `interpretTuff("1 + 2")` returns `3`.
- `interpretTuff("2 + 3 - 4")` returns `1`.
- Known wrong results (no error type yet):
  - `interpretTuff("1 - -2")` returns `-1`; the correct answer is `3`. Two operators in a row are not handled.
  - `interpretTuff("1.9 + 1")` returns `11`; decimals split into separate terms.
  - `interpretTuff("2x")` returns `2`; trailing garbage is ignored.
  - `interpretTuff("")` returns `0`; `interpretTuff("1 + x")` returns `1`.

## Testing

Run `bun test`. Each feature has a test named after the expression and its expected result, for example `interpretTuff("1 + 2") => 3`.

## Known gaps and open decisions

- **Errors:** the return type `number` cannot signal failure. Options under consideration are a `Result<number, TuffError>` type or keeping `NaN`. Undecided.
- **Operators:** only `+` and `-` are supported, and only between integers. Multiplication, grouping, and unary operators after another operator are not implemented.
- **Linting:** no linter or lint configuration exists.
