# Missing Language Features

This document catalogs language features that Tuff should probably support but currently does not. It is intended as a roadmap / wishlist to guide future work. Each entry notes the current gap and why the feature matters.

## Current Feature Set (for reference)

**Types**: `U8`, `U16`, `U64`, `I32`, `Int` (generic default), `Bool`, `Void`, references (`&T`, `&mut T`), arrays (`[T; N]`), structs.

**Statements/Expressions**: `let` (with optional type annotation and `mut`), assignment (`=` and `+=`), `if`/`else`, `while`, blocks `{ }`, functions (`fn`), structs (`struct`), references (`&`, `&mut`, `*`), arrays (`[...]`, indexing), `is` type check.

**Operators**: `||`, `&&`, `<`, `<=`, `>`, `>=`, `==`, `!=`, `+`, `-`, `*`, `/`.

---

## 1. Control Flow

### `for` loops

- **Gap**: Only `while` loops exist. No `for` loop over ranges or collections.
- **Why**: `for (i in 0..10)` or `for (x in array)` is a fundamental, ergonomic iteration construct. Without it, iterating an array requires manual index management with `while`.

### `break` / `continue`

- **Gap**: No way to exit a loop early or skip an iteration.
- **Why**: Essential for non-trivial loops (searching, filtering). Without them, loops must be restructured awkwardly.

### `return` as a statement

- **Gap**: Functions use expression bodies (`fn f() : I32 => expr`). There's no `return` statement for early returns or multi-statement function bodies.
- **Why**: Early returns (e.g. guard clauses) are a common pattern. Also needed to support statement-based function bodies.

### `match` / `switch`

- **Gap**: No pattern-matching construct.
- **Why**: A `match` expression is a core ergonomic feature in Rust-like languages, far more readable than nested `if`/`else if` chains.

### `else if` chains

- **Gap**: `else if` works via nested `else` expressions, but there's no dedicated syntax.
- **Why**: Works today, but a first-class `else if` would be clearer.

---

## 2. Types & Type System

### Signed integer types beyond `I32`

- **Gap**: Only `I32` is signed. No `I8`, `I16`, `I64`.
- **Why**: Inconsistent with the unsigned family (`U8`/`U16`/`U64`). A complete integer type set is expected.

### `I32` literal suffix

- **Gap**: Only `U8`/`U16`/`U64` have literal suffixes. `100I32` is invalid.
- **Why**: Inconsistent — you can write `100U8` but not `100I32`. Typed signed literals are missing.

### Floating-point types (`F32`, `F64`)

- **Gap**: No floating-point types at all.
- **Why**: Real-world programs need non-integer arithmetic. This is a major gap.

### `Char` / `Str` / string types

- **Gap**: The test harness prepends `in let args : &[Str];`, implying a `Str` type exists conceptually, but there's no string type, string literals, or string operations in the language.
- **Why**: Strings are fundamental. The `args` parameter is currently unusable.

### Type aliases

- **Gap**: No `type X = ...` aliases.
- **Why**: Improves readability for complex composite types (e.g. `type Point = [I32; 2]`).

### Enums / sum types

- **Gap**: Only structs (product types). No enums or sum types.
- **Why**: Sum types are a cornerstone of Rust-like languages (e.g. `Option`, `Result`).

### Generics

- **Gap**: No generic functions, structs, or types.
- **Why**: Enables reusable, type-safe abstractions (e.g. `fn max<T>(a : T, b : T) : T`).

### `Option` / `Result` / nullability

- **Gap**: No `Option`/`Result` types, no `null`/`undefined` handling.
- **Why**: Error handling and optional values are fundamental. Currently there's no way to represent "no value" except `Void`.

### Tuple types

- **Gap**: No tuples `(I32, Bool)`.
- **Why**: Lightweight anonymous grouping of values.

### Array bounds checking

- **Gap**: Array indexing is a plain JS array access with no bounds check.
- **Why**: Out-of-bounds access silently returns `undefined` (or corrupts). A safe language should check bounds.

### Array length / iteration support

- **Gap**: No `.length` property or built-in iteration for arrays.
- **Why**: Can't easily get an array's size or iterate it.

---

## 3. Functions

### Multiple statements in function bodies

- **Gap**: Function bodies are single expressions (`=> expr`). No `{ stmt; stmt; return expr; }` bodies.
- **Why**: Real functions need local variables and multiple statements.

### Recursion

- **Gap**: Functions are recorded in the symbol table, but there's no test/guarantee that a function can call itself.
- **Why**: Recursion is fundamental (factorial, tree traversal, etc.).

### Default / optional parameters

- **Gap**: All parameters are required.
- **Why**: Ergonomics for common cases.

### Variadic functions

- **Gap**: No variadic parameters.
- **Why**: Useful for `print`-style functions.

### Function overloading

- **Gap**: Function names must be unique (name-collision check).
- **Why**: Overloading by parameter type is a common convenience.

### Closures / anonymous functions / first-class functions

- **Gap**: Functions are named declarations only. No lambdas, no passing functions as values, no higher-order functions.
- **Why**: Functional programming patterns (map/filter/reduce) are impossible.

### Methods / associated functions

- **Gap**: Structs have no methods (`impl` blocks or `self`).
- **Why**: Object-oriented-style encapsulation and ergonomic field access.

---

## 4. References & Memory

### Borrow checking / lifetimes

- **Gap**: References exist (`&T`, `&mut T`) but there's no borrow checker or lifetime analysis.
- **Why**: The whole point of Rust-like references is compile-time memory safety. Without borrow checking, mutable references can alias unsafely.

### Mutation through references to arbitrary expressions

- **Gap**: Mutable references work via a setter closure that captures a variable name. Referencing complex expressions (`&mut arr[i]`) is not supported.
- **Why**: The unified `{ get, set }` model was designed for this, but it's not fully wired up.

### `null` / dangling reference safety

- **Gap**: No nullability or dangling-reference prevention.
- **Why**: References can currently point to out-of-scope or uninitialized data.

---

## 5. Operators & Expressions

### Unary operators

- **Gap**: No unary `-` (negation), `!` (logical not), or `~` (bitwise not).
- **Why**: `-x`, `!flag`, and bitwise negation are basic. (Note: `-100U8` is currently a syntax error.)

### Bitwise operators

- **Gap**: No `&`, `|`, `^`, `<<`, `>>` (bitwise AND/OR/XOR/shift).
- **Why**: Low-level programming needs bit manipulation.

### Modulo / remainder

- **Gap**: No `%` operator.
- **Why**: Fundamental arithmetic operator.

### Compound assignment operators

- **Gap**: Only `+=` exists. No `-=`, `*=`, `/=`, `%=`, etc.
- **Why**: Inconsistent — `x += 1` works but `x -= 1` doesn't.

### Increment / decrement

- **Gap**: No `++` / `--`.
- **Why**: Common shorthand.

### String concatenation

- **Gap**: `+` works on numbers only (no string type).
- **Why**: String building is impossible without it.

### Ternary operator

- **Gap**: `if`/`else` works as an expression, but there's no `cond ? a : b` shorthand.
- **Why**: Ergonomics (though `if`/`else` covers it).

---

## 6. Modules & Organization

### Modules / files / imports

- **Gap**: Everything lives in one compilation unit. No `mod`, `use`, `import`, or multi-file support.
- **Why**: Real programs need code organization and reuse across files.

### Namespaces

- **Gap**: No namespacing; all symbols share one global table.
- **Why**: Name collisions are inevitable as programs grow.

### Visibility / access control

- **Gap**: No `pub`/`private` modifiers.
- **Why**: Encapsulation and API boundaries.

---

## 7. Standard Library & I/O

### Printing / output

- **Gap**: No `print`/`println`/`write` functions.
- **Why**: A language without output is hard to use or debug. (The test harness uses `process.exit` with a numeric exit code, so there's no way to observe non-numeric output.)

### Input / reading args

- **Gap**: `args` is declared but there's no way to read individual arguments or convert them.
- **Why**: The `args` parameter is currently unusable.

### Math / standard library functions

- **Gap**: No built-in functions (abs, min, max, sqrt, etc.).
- **Why**: Basic operations require user implementation.

### Memory allocation / heap

- **Gap**: No heap allocation, `Box`, or dynamic data structures.
- **Why**: Fixed-size arrays and structs only; no dynamic collections.

---

## 8. Language Infrastructure

### Comments

- **Gap**: No comment syntax (`//`, `/* */`).
- **Why**: Code without comments is unmaintainable. This is a surprising omission.

### Error messages / diagnostics

- **Gap**: Errors are `{ kind, message }` strings with no source position (line/column).
- **Why**: Without positions, debugging compile errors is painful.

### Type inference improvements

- **Gap**: Inference is basic (literal → type, block → last statement). No inference for `let` without annotation in many cases, no inference through complex expressions.
- **Why**: Full inference reduces annotation burden.

### Casting / explicit conversion

- **Gap**: `conversionKind` has an `"explicit"` case but no cast syntax (`as`).
- **Why**: Narrowing and signed/unsigned conversions are currently impossible.

### `const` / compile-time evaluation

- **Gap**: No `const` declarations or compile-time constant folding.
- **Why**: Constants and compile-time computation are useful for optimization.

### Traits / interfaces

- **Gap**: No trait or interface system.
- **Why**: Abstraction over types (like `Display`, `Add`) is impossible.

---

## Prioritization Suggestions

**High priority (fundamental, blocks real programs):**

- Comments
- `for` loops, `break`/`continue`
- `return` statement + multi-statement function bodies
- String type + string literals + concatenation
- Printing/output
- Unary operators (`-`, `!`) and `%`
- Floating-point types

**Medium priority (ergonomics & completeness):**

- `match` expressions
- Enums / sum types
- `Option`/`Result`
- Type aliases
- Compound assignment operators (`-=`, `*=`, etc.)
- Array bounds checking
- Error positions in diagnostics

**Lower priority (advanced):**

- Generics
- Closures / first-class functions
- Borrow checking / lifetimes
- Modules / imports
- Traits
- Methods / `impl` blocks
