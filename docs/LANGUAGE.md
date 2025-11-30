# Tuff Language Specification

## Implementation Progress

| Feature                          | Status         | Tests                                                           |
| -------------------------------- | -------------- | --------------------------------------------------------------- |
| 1. Variables & Let Bindings      | ✅ Complete    | `let`, mutable bindings, type inference, no-shadowing           |
| 2. Primitive Operations          | ✅ Complete    | All arithmetic, comparison, logical operators; boolean literals |
| 3. Control Flow (if/else, while) | ⏳ In Progress | -                                                               |
| 4. Structs                       | ⏹️ Planned     | -                                                               |
| 5. Generics & Collections        | ⏹️ Planned     | -                                                               |
| 6. expect/actual Multi-platform  | ⏹️ Planned     | -                                                               |
| 7-11. Advanced Features          | ⏹️ Deferred    | -                                                               |

## Overview

Tuff is a statically-typed, self-hosting programming language that compiles to JavaScript and C++. It features:

- Static typing with type inference
- Generics with monomorphization (C++ template-style)
- Multi-platform support via `expect`/`actual` pattern
- Pointers with lifetimes (Rust-style borrow checking)
- Arrays with explicit initialization tracking to prevent use-before-init bugs

## Primitive Types

- **Unsigned Integers**: `U8`, `U16`, `U32`, `U64`
- **Signed Integers**: `I8`, `I16`, `I32`, `I64`
- **Floating Point**: `F32`, `F64`
- **Boolean**: `Bool`
- **Void**: `Void` (used for functions that return nothing)

Type aliases can be used to define composite types like strings:

```tuff
type String = *[U8];
```

## Variables

Variables are declared with explicit type annotations and are immutable by default.

```tuff
let x: I32 = 100;
let y: F32 = 3.14;
let flag: Bool = true;
```

## Control Flow

### If Statements

`if` can be used as a statement or expression.

**Statement form**:

```tuff
if (x > 0)
    y = 100;
else
    y = 200;
```

**Expression form** (ternary-like):

```tuff
let result = if (x > 0) 100 else 200;
```

### While Loops

```tuff
while (i < 10) {
    i = i + 1;
}
```

## Operators

### Comparison

- `<`, `>`, `<=`, `>=`, `==`, `!=`

### Logical

- `&&`, `||`, `!`

### Bitwise

- `&`, `|`, `^`, `~`, `<<`, `>>`

### Arithmetic

- `+`, `-`, `*`, `/`, `%`

### Assignment

- `=`

## Functions

Functions are declared with the `fn` keyword and use the fat arrow `=>` for the body.

```tuff
fn add(a: I32, b: I32): I32 => a + b;

fn main(): Void => {
    let result = add(5, 3);
}
```

### Generics

Functions and types can be generic using angle brackets. Type parameters are inferred at call sites.

```tuff
fn identity<T>(value: T): T => value;

fn swap<T>(a: T, b: T): (T, T) => (b, a);
```

## Structs

Structs are product types with named fields.

**Definition**:

```tuff
struct Point {
    x: I32,
    y: I32
}
```

**Construction** (positional):

```tuff
let p = Point { 10, 20 };
```

**Field access**:

```tuff
let x_coord = p.x;
```

## Enums

Enums are sum types with named variants. Currently, simple variants only (no associated data).

```tuff
enum Color {
    Red,
    Green,
    Blue
}
```

## Arrays

Arrays have explicit initialization tracking to prevent use-before-init bugs.

**Type syntax**: `[Type; Initialized; Total]`

- `Type`: The element type
- `Initialized`: Number of elements that have been initialized
- `Total`: Total capacity of the array

```tuff
let arr: [I32; 3; 5] = [1, 2, 3];
let first = arr[0];
```

The type ensures you cannot access `arr[4]` when only 3 elements are initialized.

## Pointers

Pointers are non-nullable and use Rust-style lifetimes for borrow checking.

**Syntax**:

- `*T` - Pointer to type T
- `&value` - Create a reference to value
- `*ptr` - Dereference a pointer

```tuff
let x: I32 = 42;
let ptr: *I32 = &x;
let deref: I32 = *ptr;
```

## Comments

Single-line and multi-line comments are supported.

```tuff
// Single-line comment

/* Multi-line
   comment */
```

## Multi-Platform Support: expect/actual

Tuff uses the `expect`/`actual` pattern (similar to Kotlin Multiplatform) to support platform-specific implementations.

**Declaring an interface** (core module):

```tuff
expect fn print(message: String): Void;
```

**Implementing for JavaScript** (js module):

```tuff
actual fn print(message: String): Void => {
    // console.log implementation
}
```

**Implementing for C++** (cpp module):

```tuff
actual fn print(message: String): Void => {
    // std::cout implementation
}
```

When compiling for a target, all `expect` declarations must have corresponding `actual` implementations in that target's module.

## Example: Hello World

**core/main.tuff**:

```tuff
expect fn print(message: String): Void;

fn main(): Void => {
    print("Hello, Tuff!");
}
```

**js/io.tuff**:

```tuff
actual fn print(message: String): Void => {
    // JS runtime will implement this
}
```

**cpp/io.tuff**:

```tuff
actual fn print(message: String): Void => {
    // C++ runtime will implement this
}
```

## Compilation Targets

### JavaScript (Node.js)

Compiles to modern JavaScript, suitable for Node.js runtime.

### C++

Compiles to standard C++ (C++17), linkable with system C libraries via `expect`/`actual` pattern.

## Type System

- **Static typing**: All types are checked at compile time
- **Type inference**: Limited inference for literals and generic type parameters
- **Generics**: Monomorphization (each generic specialization becomes a separate function)
- **Lifetimes**: Required annotations for pointer parameters (Rust-style)

## Type System: Literal Types (Planned)

Tuff will eventually support **literal types** for compile-time value tracking and overflow detection:

```tuff
let x = 5;           // x: 5I32 (literal type)
let y: I32 = 5;      // y: I32 (widened to base type)
let z: U8 = 5;       // z: U8 (auto-widened from 5I32)

let a: 100U8 = 100U8;    // a: 100U8 (explicit literal type)
let b = a + a;           // Error: 200U8 overflows (max 255U8)
```

**Design:**

- Literals have both value and type: `5` → `5I32`
- Operations preserve literal precision: `(5U8) + (10U8)` → `15U8`
- Compile-time overflow detection for all arithmetic
- Assignability: `LiteralType ≤ BaseType` but not vice versa
- Propagation: `let y = x` where `x: 5U8` → `y: 5U8`
- Base types track ranges: `U8` = `[0, 255]U8`, `I32` = `[-2^31, 2^31-1]I32`

This is deferred until after the compiler can self-host.

## Advanced Array Safety (Deferred)

Tuff will support **compile-time initialization tracking** for arrays to prevent use-before-init bugs:

```tuff
// Array pointer with type-level initialization tracking
let mut array : *[I32, 0, 100] = malloc(SizeOf<I32> * 100);
// Type: pointer to I32 array, 0 initialized, capacity 100

array[0] = 10;   // OK: initializes index 0 → type becomes *[I32, 1, 100]
array[1] = 20;   // OK: initializes index 1 → type becomes *[I32, 2, 100]
array[2] = 30;   // OK: initializes index 2 → type becomes *[I32, 3, 100]

array[5] = 50;   // ERROR: cannot skip indices (only 3 initialized)
let x = array[4]; // ERROR: reading uninitialized memory (only 3 initialized)
```

**Destructor Pattern:**

```tuff
type Allocated<T, L : USize> = *[T; 0; L] & ~free;
extern fn malloc<T, L : USize>(count : SizeOf<T> * L) : Allocated<T, L>;
extern fn free(this : Allocated<T, L : USize>) : Void;

// ~free is a destructor: any function matching fn ?(this : T) => Void
// Automatically called when value goes out of scope
```

**Features:**

- Sequential initialization enforced at compile-time
- Array literals: `*[I32, 3, 100] = [10, 20, 30]`
- Loop analysis: `for i in 0..n { array[i] = i }` tracks initialization count
- Safe slicing: `array[0..n]` only exposes initialized portion

This requires advanced flow-sensitive type checking and is **extremely complex** - deferred until post-self-hosting.

## Future Extensions

Features not yet implemented but planned:

- Literal types with compile-time range tracking and overflow detection
- Advanced array initialization tracking (see above)
- Pattern matching on enums with associated data
- Trait/interface system
- Module system beyond expect/actual
- Compile-time metaprogramming
- Error handling (Result types)
