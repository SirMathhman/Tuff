# Missing Features (C-like Roadmap)

## Data Structures
- [x] Array length property (`.length`)
- [x] Struct declarations (`struct Name {}`)
- [x] Structs with fields / user-defined types (declaration, instantiation, field access)
- [x] Address-of operator (`&`)
- [x] Mutable references (`&mut x`, `: &mut Type`) and dereference-assignment (`*y = ...`)

## I/O & Built-ins
- [x] String literals (passthrough to JS, supports `.length`)
- [x] String type (`&Str`, `read<&Str>()`, `_readString()`)
- [x] Character type (`Char`, `'a'` → ASCII at compile time)
- [x] String indexing (`"test"[0]` → ASCII value)
- [ ] Output/print statements (`print(x)`, `println()`) — currently only input via `read()`

## Operators & Expressions
- [x] Unary negation: `-x`
- [x] Unary logical NOT: `!x`
- [ ] Increment/decrement: `++x`, `--x`

## Type System
- [x] Implicit type inference from `read<T>()` in RHS of `let` declarations
- [x] `Char` type for character literals
- [ ] Type casting / conversion operators (`(U8)x`, `as U8`)
- [ ] Additional numeric types: `U64`, `I64`
- [ ] Enumerations  

## Statements & Scoping
- [x] `this` keyword (`this.x` → `x`, `let y = this; y.x` → `x`)
- [x] Method calls via `this` parameter (`fn addOnce(this : I32) => this + 1; 100.addOnce()`)
- [x] Struct destructuring (`let { x, y } = Point { x: 3, y: 4 }`)
- [x] Multi-module compilation (`compileModules`, `out let`, cross-module refs `lib.myVar`, nested modules `lib::sub`)
- [x] Extern declarations (`extern fn`, `extern struct`, `extern let`)
- [ ] Labelled statements and `goto` (if aiming for C parity)
- [ ] Const expressions / compile-time constants (`const PI : F32 = 3.14`)

## Error Handling & Diagnostics
- [ ] Structured error messages with line/column information
- [ ] Panic/assert mechanism at runtime
- [ ] Compile-time warnings (unused variables, unreachable code)
