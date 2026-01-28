# Tuff Language Specification (Draft)

This is an evolving specification of the Tuff language syntax and semantics. Features are organized by implementation priority.

## Core Guarantee: No Panics

**Tuff code is guaranteed to never panic or crash at runtime.** This is a fundamental language design goal, not an optional feature. The language prevents panics through:

- No `null` pointer dereferences (enforced via optional types `T?`)
- No array out-of-bounds access (runtime checked)
- No arithmetic overflow/underflow panics (wrapping semantics or runtime checks)
- No invalid type casts (compile-time verified)
- No unwinding from failed assertions in release mode
- Explicit error handling via `Result<T>` or optional returns

This guarantee makes Tuff suitable for:
- Mission-critical systems that cannot tolerate crashes
- Long-running services that must be highly reliable
- Embedded and real-time systems
- Any application requiring predictable, crash-free execution

## Naming Conventions

Tuff follows the same naming conventions as C, Java, and TypeScript:

| Category | Convention | Examples |
|----------|-----------|----------|
| **Types** (struct, enum, trait, type alias) | `PascalCase` | `Point`, `Color`, `Result<T>`, `UserId` |
| **Functions** | `camelCase` | `add`, `greet`, `calculateTotal`, `parseInput` |
| **Variables** | `camelCase` | `x`, `myValue`, `currentIndex`, `tempName` |
| **Constants** | `UPPER_SNAKE_CASE` | `PI`, `MAX_SIZE`, `HTTP_TIMEOUT` |
| **Module/File names** | `snake_case` | `math.tuff`, `http_client.tuff`, `ui_helpers.tuff` |

Examples:

```tuff
struct PersonInfo {  // PascalCase for struct
  firstName: *Str    // camelCase for field (borrowed)
  lastName: *Str
}

enum NetworkStatus {  // PascalCase for enum
  Connected,
  Disconnected,
}

const MAX_RETRIES: i32 = 3  // UPPER_SNAKE_CASE for constant

fn calculateDistance(p1: Point, p2: Point) -> f64 {  // camelCase for function
  let dx = p2.x - p1.x  // camelCase for variable
  let dy = p2.y - p1.y
  // ...
}

type Result<T> = T | null  // PascalCase for type alias
```

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
| `*Str` | UTF-8 slice | Variable | `"hello"` (borrowed string) |
| `String` | UTF-8 owned | Variable | Allocated string |
| `void` | N/A | None | Implicit return |

### String Types: *Str vs String

Tuff distinguishes between **borrowed** and **owned** strings:

| Type | Use Case | Allocation | Lifetime |
|------|----------|-----------|----------|
| `*Str` | Function parameters, string slices | No (borrowed) | Caller owns memory |
| `String` | Return values, owned strings | Yes (heap allocated) | Type owns memory |

This is similar to Rust's `&str` vs `String`:

```tuff
let owned: String = "Hello, World!"  // Owned string allocated on heap

fn print_name(name: *Str) {          // Parameter takes borrowed reference
  print("Name: " + name)
}

let name: String = "Alice"
print_name(name)                      // name is not consumed (borrowed)

fn get_greeting() -> String {        // Returns owned string
  "Hello"
}

let greeting = get_greeting()        // greeting owns the returned string
```

When passing strings to functions, use `*Str` for parameters. When storing or returning strings, use `String`.

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

fn greet(name: *Str) {
  // Implicit return of void
  print("Hello, " + name)
}
```

Functions can have default parameters and optional returns. Optional returns (using `T?`) are the primary error handling mechanism:

```tuff
fn power(base: i32, exp: i32 = 2) -> i32 {
  // ...
}

fn maybe_divide(a: i32, b: i32) -> i32? {
  if b == 0 {
    null  // Represents division failure
  } else {
    a / b
  }
}

// Caller must handle the optional return
let result = maybe_divide(10, 2)
if result != null {
  print("Result: " + string(result))
} else {
  print("Division failed")
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
  pub name: String  // Public field (owned)
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
type Handler = fn(*Str) -> void
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
    print("Drawing circle with radius " + string(radius))  // string() converts to String
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
print(value: *Str) -> void
println(value: *Str) -> void

// Type conversion
string(value: any) -> String  // Converts any type to owned String
number(value: *Str) -> i32?

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

## Error Handling

Tuff enforces a no-panic policy through explicit error handling patterns:

### Optional Types (`T?`)
Used when an operation may fail with no additional error information:

```tuff
fn parseInt(s: *Str) -> i32? {
  // Returns null if parsing fails
}
```

### Result Types (Planned)
Used to return either a value or detailed error information:

```tuff
enum Result<T> {
  Ok(T),
  Err(*Str),
}

fn readFile(path: *Str) -> Result<String> {
  // Returns Ok(contents) or Err(error_message)
}
```

### The `?` Operator (Planned)
Propagates errors up the call stack safely:

```tuff
fn processFile(path: *Str) -> Result<i32> {
  let contents = readFile(path)?  // Unwrap or propagate error
  let count = countLines(contents)?
  Ok(count)
}
```

This ensures errors are always handled explicitly rather than causing panics.

## Planned Features

- Ownership and borrowing system
- Lifetime annotations
- Closures and higher-order functions
- Result type with `?` operator for richer error handling
- Decorators/attributes
- Macros
- Async/await (future)
- SIMD support (future)

## Differences from Inspiration Languages

### vs. Rust
- Less strict ownership (closer to TypeScript defaults)
- Automatic null handling vs. explicit `Option<T>`
- Simpler trait system (no variance, fewer rules)
- **Same guarantee**: Both provide crash-free execution by design

### vs. TypeScript
- Explicit types (less inference, more clarity)
- Performance-oriented (compile to native, not JS)
- **Better reliability**: No panics or uncaught exceptions at runtime
- Stricter null safety (no accidental nulls)

### vs. Kotlin
- Compilation to native code, not JVM
- More focus on performance/systems programming
- Stricter null safety options
- **Native guarantee**: No reliance on JVM error handling

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
