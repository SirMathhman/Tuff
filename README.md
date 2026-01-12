# Tuff

A small TypeScript interpreter for the Tuff language.

## Getting started

- Install dependencies with pnpm.
- Run the test suite with `pnpm test`.

## Higher-order functions

Tuff supports function values (functions can be:
- assigned to variables,
- passed as arguments,
- returned from other functions).

Example (returning a function / closure capture):

- `let makeAdder = fn make(n : I32) => { fn add(x : I32) => { x + n }; add };`
- `let add2 = makeAdder(2);`
- `add2(3)` evaluates to `5`.
