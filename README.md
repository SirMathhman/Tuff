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
