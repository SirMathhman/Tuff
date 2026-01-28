# Tuff Language Specification (Draft)

This is an evolving specification of the Tuff language syntax and semantics. Features are organized by implementation priority.

## Core Language Features

### Comments

```tuff
// Single-line comment

/* Multi-line
   comment */
```

### Primitive Types

Tuff includes the following primitive types:

| Type | Size | Range | Example |
|------|------|-------|---------|
| `i32` | 32-bit | -2^31 to 2^31-1 | `42_i32` |
| `i64` | 64-bit | -2^63 to 2^63-1 | `1000_i64` |
| `u32` | 32-bit unsigned | 0 to 2^32-1 | `42_u32` |
| `u64` | 64-bit unsigned | 0 to 2^64-1 | `1000_u64` |
| `f32` | 32-bit float | IEEE 754 single | `3.14_f32` |
| `f64` | 64-bit float | IEEE 754 double | `3.14` |
| `bool` | 1-bit | `true` or `false` | `false` |
| `string` | UTF-8 | Variable | `"hello"` |
| `void` | N/A | None | Implicit return |

### Variables

Variables are declared with `let` (immutable) or `let mut` (mutable):

```tuff
let x: i32 = 42
let mut y = 0  // Type inferred as i32
y = 1
```

### Constants

Constants use `const` and must have explicit types:

```tuff
const PI: f64 = 3.14159
```

### Functions

Functions are declared with `fn`:

```tuff
fn add(a: i32, b: i32) -> i32 {
  a + b
}

fn greet(name: string) {
  // Implicit return of void
  print("Hello, " + name)
}
```

Functions can have default parameters and optional returns:

```tuff
fn power(base: i32, exp: i32 = 2) -> i32 {
  // ...
}

fn maybe_divide(a: i32, b: i32) -> i32? {
  if b == 0 {
    null
  } else {
    a / b
  }
}
```

### Structs

Structs group related data:

```tuff
struct Point {
  x: f64
  y: f64
}

struct Person {
  pub name: string  // Public field
  age: i32          // Private field
}

// Construction
let p = Point { x: 1.0, y: 2.0 }
let person = Person { name: "Alice", age: 30 }
```

### Enums

Enums define a set of variants:

```tuff
enum Color {
  Red,
  Green,
  Blue,
}

enum Result<T> {
  Ok(T),
  Err(string),
}
```

### Pattern Matching

Match expressions provide exhaustive pattern matching:

```tuff
match value {
  0 => "zero",
  1 | 2 => "small",
  3..10 => "medium",
  _ => "other",
}

// With bindings
match result {
  Result::Ok(value) => print("Success: " + value),
  Result::Err(msg) => print("Error: " + msg),
}
```

### Type Aliases

```tuff
type UserId = u64
type Handler = fn(string) -> void
type Maybe<T> = T | null
```

### Generics

Functions and types support generic parameters:

```tuff
fn identity<T>(value: T) -> T {
  value
}

struct Container<T> {
  item: T
}
```

### Traits

Traits define shared behavior:

```tuff
trait Drawable {
  fn draw() -> void
}

struct Circle {
  radius: f64
}

impl Drawable for Circle {
  fn draw() -> void {
    print("Drawing circle with radius " + string(radius))
  }
}
```

### Access Control

Items can be marked `pub` for public visibility, otherwise private:

```tuff
pub struct PublicStruct { }
pub fn public_function() { }

fn private_function() { }
```

### Type Casting

Explicit type conversion with `as`:

```tuff
let x = 42_i32
let y = x as f64  // 42.0_f64
```

## Expressions

### Binary Operators

```tuff
// Arithmetic
a + b, a - b, a * b, a / b, a % b

// Comparison
a == b, a != b, a < b, a <= b, a > b, a >= b

// Logical
a && b, a || b

// Bitwise
a & b, a | b, a ^ b, a << b, a >> b
```

### Unary Operators

```tuff
-value     // Negation
!bool      // Logical NOT
```

### Array Access and Member Access

```tuff
items[0]           // Array indexing
point.x            // Struct field access
container.first()  // Method call
```

### Conditionals

```tuff
if condition {
  // ...
} else if other {
  // ...
} else {
  // ...
}

// Conditional expression
let result = if condition { "yes" } else { "no" }
```

### Loops

```tuff
// While loop
while condition {
  // ...
}

// For loop
for i in 0..10 {
  print(i)
}

// Infinite loop
loop {
  if should_break {
    break
  }
}
```

## Standard Library (Planned)

Common functions will be available in the standard library:

```tuff
// Printing
print(value: string) -> void
println(value: string) -> void

// Type conversion
string(value: any) -> string
number(value: string) -> i32?

// Collections
len(array: T[]) -> u64
push<T>(mut array: T[], item: T) -> void
pop<T>(mut array: T[]) -> T?
```

## Module System (Planned)

Import and use modules:

```tuff
use std::io
use { Vector, HashMap } from collections
use math as m

fn main() {
  let v = m::sqrt(16.0)
}
```

## Planned Features

- Ownership and borrowing system
- Lifetime annotations
- Unsafe blocks for low-level operations
- Closures and higher-order functions
- Error handling with `?` operator
- Decorators/attributes
- Macros
- Async/await (future)
- SIMD support (future)

## Differences from Inspiration Languages

### vs. Rust
- Less strict ownership (closer to TypeScript defaults)
- Automatic null handling vs. explicit `Option<T>`
- Simpler trait system (no variance, fewer rules)

### vs. TypeScript
- Explicit types (less inference, more clarity)
- Performance-oriented (compile to native, not JS)
- Memory safety by default (eventually)

### vs. Kotlin
- Compilation to native code, not JVM
- More focus on performance/systems programming
- Stricter null safety options

## Type Inference Limitations

Tuff uses **limited type inference**:

- Function parameters always require explicit types
- Return types are inferred from function body
- Variable types can be inferred in assignments
- Generic type arguments may need explicit specification

```tuff
// ✓ OK - return type inferred from expressions
fn double(x: i32) {
  x * 2
}

// ✗ Error - parameter type required
fn triple(x) {
  x * 3
}

// ✓ OK - type inferred from assignment
let nums = [1, 2, 3]  // inferred as i32[]
```
