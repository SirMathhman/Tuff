# Missing Features (C-like Roadmap)

## Control Flow
- [ ] `if` / `else if` / `else` — conditional branching with boolean expressions
- [ ] `while` loops — indefinite iteration
- [ ] `for` loops — definite iteration (`for init; cond; inc`)
- [ ] `break` / `continue` — loop control statements

## Comparison & Boolean Operators
- [ ] Relational operators: `<`, `>`, `<=`, `>=`, `==`, `!=`
- [ ] Logical operators: `&&`, `||`, `!`
- [ ] Boolean literals (`true`/`false`) and a Bool type (or implicit booleans)

## Functions
- [ ] Function declarations with parameters and return types (`fn add(a : I32, b : I32) -> I32 { ... }`)
- [ ] Function calls beyond `read()` / built-ins
- [ ] Recursion support
- [ ] Return statements inside function bodies

## Data Structures
- [ ] Arrays with indexing (`let arr = [1, 2, 3]; let x = arr[0]`)
- [ ] Array length property (`.len` or `sizeof`)
- [ ] Structs / user-defined types
- [ ] Pointers and address-of operator (`&`, `*`)

## I/O & Built-ins
- [ ] Output/print statements (`print(x)`, `println()`) — currently only input via `read()`
- [ ] String literals and string type (at minimum for error messages / output)

## Operators & Expressions
- [ ] Unary operators: `-x`, `!x`
- [ ] Remaining compound assignments: `-=`, `*=`, `/=` 
- [ ] Increment/decrement: `++x`, `--x`
- [ ] Ternary conditional expression (`cond ? a : b`)

## Type System
- [ ] Implicit type inference (currently requires explicit annotation in many paths)
- [ ] Type casting / conversion operators (`(U8)x`, `as U8`)
- [ ] Additional numeric types: `U64`, `I64`
- [ ] Enumerations

## Statements & Scoping
- [ ] Early returns from blocks/IIFEs
- [ ] Labelled statements and `goto` (if aiming for C parity)
- [ ] Const expressions / compile-time constants (`const PI : F32 = 3.14`)

## Error Handling & Diagnostics
- [ ] Structured error messages with line/column information
- [ ] Panic/assert mechanism at runtime
- [ ] Compile-time warnings (unused variables, unreachable code)
