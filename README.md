# Tuff

A small interpreted language implemented in Rust.

## Block semantics

Tuff supports block expressions/blocks using `{ ... }`.

- **Declarations are scoped to the block**: variables declared with `let` inside a block are not visible outside of it.
- **Assignments to outer variables persist**: if a variable is declared in an outer scope, assigning to it inside a block updates the outer variable (including initializing a previously-declared-but-uninitialized variable).

Examples:

- Declaration does not leak:
  - `{ let x = 100; } x` is an error.
- Assignment persists:
  - `let x : I32; { x = 100; } x` evaluates to `100`.
- A standalone block expression must be used where a value is expected:
  - `let a = { 123 }; a` is valid, but `let x = 100; { 7893 } x` is an error.

## If expressions and statements

Tuff supports `if` in both expression and statement forms:

- **Expression form** requires `else` and returns a value:
  - `let x = if (true) 3 else 5; x`
- **Statement form** does not require `else` and is useful in control flow:
  - `if (x == 5) break;`

## Struct constructors and method references

Tuff supports constructor functions that return a struct instance via `this`, and you can reference methods without invoking them.

Example:

- Define a struct and constructor with a method, then reference the method:

  - `struct Point { x : I32, y : I32 } fn Point(x : I32, y : I32) : Point => { fn get() : I32 => x + y; this } let myGet : () => I32 = Point(3, 4).get; myGet()`

- Method pointer access with `::`:
  - `struct Point { x : I32, y : I32 } fn Point(x : I32, y : I32) : Point => { fn get() : I32 => x + y; this } let point = Point(3, 4); let getPtr : *() => I32 = point::get; getPtr(&point)`

## Custom lints

This repo uses a small custom lints tool (`tuff_lints`) to enforce a couple of rules that Clippy can't be configured for precisely.

- Maximum nested block depth inside functions: `--max-fn-nesting` (default: 2)
- Maximum number of fields per struct: `--max-struct-fields` (default: 5)

The pre-commit hook runs the lints against `.tuff_lints_baseline.json`, which allows existing violations to remain while preventing new violations (or worsening existing ones).
