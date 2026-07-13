# Missing Features (C-like Roadmap)

## Data Structures
- [x] Array length property (`.length`)
- [x] Struct declarations (`struct Name {}`)
- [x] Structs with fields / user-defined types (declaration, instantiation, field access)
- [x] Address-of operator (`&`)
- [ ] Dereference operator (`*`) / pointer indirection

## I/O & Built-ins
- [ ] Output/print statements (`print(x)`, `println()`) — currently only input via `read()`
- [ ] String literals and string type (at minimum for error messages / output)

## Operators & Expressions
- [ ] Unary operators: `-x`, `!x`
- [ ] Remaining compound assignments: `-=`, `*=`, `/=`
- [ ] Increment/decrement: `++x`, `--x`

## Type System
- [ ] Implicit type inference (currently requires explicit annotation in many paths)
- [ ] Type casting / conversion operators (`(U8)x`, `as U8`)
- [ ] Additional numeric types: `U64`, `I64`
- [ ] Enumerations  

## Statements & Scoping
- [ ] Labelled statements and `goto` (if aiming for C parity)
- [ ] Const expressions / compile-time constants (`const PI : F32 = 3.14`)

## Error Handling & Diagnostics
- [ ] Structured error messages with line/column information
- [ ] Panic/assert mechanism at runtime
- [ ] Compile-time warnings (unused variables, unreachable code)
