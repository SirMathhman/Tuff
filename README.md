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
