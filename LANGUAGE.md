# Tuff Language Specification

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

## Future Extensions

Features not yet implemented but planned:

- Pattern matching on enums with associated data
- Trait/interface system
- Module system beyond expect/actual
- Compile-time metaprogramming
- Error handling (Result types)
