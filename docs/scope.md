# Scope and cells

Definitions of the runtime state that a sequence of statements builds up. The
entry point is [ARCHITECTURE.md](../ARCHITECTURE.md).

- **Variable and cell**: each declared variable gets a numeric id. Its value
  (an `Operand`, or a `Reference`) lives in a cell table keyed by that id, not
  in the name map. A name maps to its id and mutability.
- **Scope**: the variables visible at one point of the source. A scope holds
  the name map, the set of names the current block declared itself, the cell
  table, and the next free id. Declaring or assigning returns a new scope; it
  never mutates one. Closing a block keeps the enclosing scope's names and the
  cell table with the block's assignments applied, except names the block
  declared.
- **Mutability**: a name declared with `let` is fixed. Only a name declared with
  `let mut` may be reassigned. Assigning to a fixed name, or to an undeclared
  name, is an error. An assignment inside a block to an enclosing `let mut` name
  persists after the block closes. A `let` in the block that shadows the name
  is not affected. `&mut name` requires `let mut`.
