# Tuff Language Specification

## Implementation Progress

| Feature                          | Status      | Tests                                                           |
| -------------------------------- | ----------- | --------------------------------------------------------------- |
| 1. Variables & Let Bindings      | ✅ Complete | `let`, mutable bindings, type inference, no-shadowing           |
| 2. Primitive Operations          | ✅ Complete | All arithmetic, comparison, logical operators; boolean literals |
| 3. Control Flow (if/else, while) | ✅ Complete | if/else statements & expressions, while, loop, break, continue  |
| 4. Structs                       | ✅ Complete | Definition, instantiation, field access, mutation, nesting      |
| 5. Functions                     | ✅ Complete | Declaration, calls, return statements, recursion, forward refs  |
| 6. Enums                         | ✅ Complete | Simple unit enums, variant access, equality comparison          |
| 7. Generics & Collections        | ⏹️ Planned  | -                                                               |
| 8. expect/actual Multi-platform  | ✅ Complete | Fully qualified names, signature validation, JS & C++ codegen   |
| 9. Modules & Namespaces          | ✅ Complete | Module blocks, FQN support, nested modules, JS & C++ codegen    |
| 9-13. Advanced Features          | ⏹️ Deferred | -                                                               |

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

## Module System

Tuff's module system organizes code into hierarchical namespaces, similar to Java packages. Each Tuff source file implicitly defines a module based on its file path.

### File-to-Module Mapping

Given a root directory (e.g., `./src/tuff`), a file at `./src/tuff/com/example.tuff` defines the module `com::example`.

**Example:**

- File: `./src/tuff/io.tuff` → Module: `io`
- File: `./src/tuff/com/example.tuff` → Module: `com::example`
- File: `./src/tuff/org/util/math.tuff` → Module: `org::util::math`

### Module Declarations (Block Form)

You can explicitly wrap code in a module block:

```tuff
module math {
    fn add(x: I32, y: I32): I32 => x + y;
    fn multiply(x: I32, y: I32): I32 => x * y;
}
```

This declares the functions within the `math` namespace, making them accessible as `math::add` and `math::multiply`.

### Use Declarations

Import a module with the `use` keyword:

```tuff
use com::example;  // Import module com::example
```

After a `use` declaration, you can reference members of that module directly or via FQN.

### Fully Qualified Names (FQN)

All identifiers (functions, types, struct fields, etc.) can be referenced using FQN:

```tuff
expect fn print(message: String): Void;

fn main(): Void => {
    io::println("Hello");           // Call io::println (FQN)
    let c: Color::Red = Color::Red; // Access enum variant via FQN
}
```

### Scope Resolution

1. **Current module members** are always visible without qualification.
2. **Imported modules** (via `use`) can be accessed with or without the full path, depending on what was imported.
3. **Unqualified names** are resolved in this order:
   - Local scope (variables, function parameters)
   - Current module (functions, types, constants)
   - Imported modules (if unambiguous)
4. **Ambiguous references** (name exists in multiple imported modules) must use FQN.

### Cross-File Modules

Modules can span multiple files. If two files in the same directory declare the same module:

```tuff
// src/tuff/com/base.tuff
module com::base {
    struct Point { x: I32, y: I32 }
}

// src/tuff/com/util.tuff
module com::util {
    fn distance(a: Point, b: Point): F32 => {
        // Use Point from com::base
    }
}
```

To use `Point` in `util.tuff`, add `use com::base;` at the top.

### Integration with expect/actual

Module names in expect/actual declarations are fully qualified:

```tuff
// core/main.tuff
expect fn io::println(message: String): Void;

fn main(): Void => {
    io::println("Hello, Tuff!");
}

// js/io.tuff (compiled for JavaScript)
actual fn io::println(message: String): Void => {
    // JS implementation
}

// cpp/io.tuff (compiled for C++)
actual fn io::println(message: String): Void => {
    // C++ implementation
}
```

### Module Visibility

All modules are globally visible within a single compilation. There is no public/private distinction at the module level. All functions, types, and constants in a module are accessible from any other module if referenced by FQN or after a `use` declaration.

**Note:** Access control (public/private/protected) is deferred to future versions.

## Multi-Platform Support: expect/actual

Tuff uses the `expect`/`actual` pattern (similar to Kotlin Multiplatform) to support platform-specific implementations.

**Declaring an interface** (expect):

```tuff
expect fn print(message: String): Void;
```

**Implementing the interface** (actual):

```tuff
actual fn print(message: String): Void => {
    // Implementation for specific target
}
```

**Fully Qualified Names:**

For namespace organization, expect/actual declarations can use fully qualified names with `::` separators:

```tuff
expect fn math::add(x: I32, y: I32): I32;
actual fn math::add(x: I32, y: I32): I32 => x + y;

expect fn io::print(msg: String): Void;
actual fn io::print(msg: String): Void => {
    // IO implementation
}
```

**Signature Validation:**

Each `actual` must match its corresponding `expect` exactly:

- Return type must be identical
- Parameter count must match
- Parameter types must match in order
- Parameter names are not significant

**Compilation Model:**

When compiling for a target:

1. All source files are parsed
2. All `expect` declarations are registered with their fully qualified names
3. All `actual` declarations are validated against their corresponding `expect`
4. An error is raised if an `expect` has no matching `actual` or signatures don't match
5. `expect` declarations are skipped in code generation
6. `actual` declarations are emitted as function implementations

**Example: Cross-Platform Hello World**

core/main.tuff:

```tuff
expect fn print(message: String): Void;

fn main(): Void => {
    print("Hello, Tuff!");
}
```

js/io.tuff:

```tuff
actual fn print(message: String): Void => {
    // JS console.log
}
```

cpp/io.tuff:

```tuff
actual fn print(message: String): Void => {
    // C++ std::cout
}
```

When compiling for JavaScript, `actual fn print` from `js/io.tuff` is used. When compiling for C++, `actual fn print` from `cpp/io.tuff` is used.

**Future Enhancement:**

Cross-DLL support is deferred. Currently, all `expect`/`actual` matching occurs within a single compilation unit. Future versions will support linking separate compiled modules.

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
