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

- Splits the source on `+`.
- Parses each part with `parseInt(part, 10)`.
- Sums the parts, starting from `0`.

Current behavior:

- `interpretTuff("5")` returns `5`.
- `interpretTuff("1 + 2")` returns `3`.
- Non-numeric input yields `NaN`. There is no error type yet.

## Testing

Run `bun test`. Each feature has a test named after the expression and its expected result, for example `interpretTuff("1 + 2") => 3`.

## Known gaps and open decisions

- **Errors:** the return type `number` cannot signal failure. Options under consideration are a `Result<number, TuffError>` type or keeping `NaN`. Undecided.
- **Operators:** only `+` is supported. Subtraction, multiplication, and grouping are not implemented.
- **Linting:** no linter or lint configuration exists.
