# Tuff Language Specification

## Overview

Tuff is a statically-typed, self-hosting programming language that compiles to JavaScript and C++. It features:

- Static typing with type inference
- Generics (C++ templates for native, dynamic typing for JS)
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

## Methods and Impl Blocks

Methods are functions associated with a struct, defined within an `impl` block.

### Defining Methods

```tuff
struct Counter {
    value: I32
}

impl Counter {
    // Static method (constructor pattern)
    fn new(): Counter => Counter { 0 };

    // Instance method (takes 'this' parameter)
    fn increment(this: *mut Counter): Void => {
        this.value = this.value + 1;
    }

    fn getValue(this: *Counter): I32 => this.value;
}
```

### Method Call Syntax

Methods can be called using dot notation. The compiler automatically handles referencing (`&` or `&mut`) based on the `this` parameter type.

```tuff
let mut c = Counter::new();

// Equivalent to Counter::increment(&mut c)
c.increment();

// Equivalent to Counter::getValue(&c)
let val = c.getValue();
```

### Static Methods

Static methods (functions without a `this` parameter) are called using the namespace syntax:

```tuff
let c = Counter::new();
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

**Type syntax**: `[Type; Initialized; Capacity]`

- `Type`: The element type
- `Initialized`: Number of elements that have been initialized
- `Capacity`: Total capacity of the array

**Array literals** (inferred type):

```tuff
let arr = [1, 2, 3];        // Type: [I32; 3; 3]
let first = arr[0];          // 1
let second = arr[1];         // 2
```

**Mutable arrays**:

```tuff
let mut arr = [1, 2, 3];
arr[0] = 100;                // Modify element
```

**Explicit type annotation**:

```tuff
let arr: [I32; 3; 5] = [1, 2, 3];  // 3 initialized, capacity 5
```

The type ensures you cannot access `arr[4]` when only 3 elements are initialized (enforced at compile-time in future versions).

## Pointers

Pointers provide low-level memory access with mutability control.

**Pointer types**:

- `*T` - Immutable pointer (cannot modify pointee)
- `*mut T` - Mutable pointer (can modify pointee)

**Reference operators**:

- `&x` - Create immutable reference to `x`
- `&mut x` - Create mutable reference to `x` (requires `let mut x`)

**Dereference operator**:

- `*p` - Read value through pointer

**Examples**:

```tuff
// Immutable pointer
let x: I32 = 42;
let p: *I32 = &x;
let y: I32 = *p;              // y = 42

// Mutable pointer
let mut x: I32 = 10;
let p: *mut I32 = &mut x;
*p = 50;                       // x is now 50
```

**C++ codegen**:

- `*I32` → `const int32_t*` (pointer to const)
- `*mut I32` → `int32_t*` (pointer to mutable)
- `let p: *T` → `T* const p` (const pointer)
- `let mut p: *T` → `T* p` (mutable pointer)

**JS codegen**:

- Immutable refs: pass by value
- Mutable refs: wrapper object `{ptr: () => x, set: (v) => x = v}`

## Function Pointers

Function pointers allow passing functions as values.

**Type syntax**: `|ParamType1, ParamType2| => ReturnType`

**Creating function pointers**:

- `&functionName` - Create a pointer to a function

**Examples**:

```tuff
fn add(a: I32, b: I32): I32 => a + b;

// Function pointer variable
let f: |I32, I32| => I32 = &add;

// Call through function pointer
let result: I32 = f(10, 20);  // 30

// Function taking a function pointer
fn apply(op: |I32, I32| => I32, x: I32, y: I32): I32 => op(x, y);

let sum: I32 = apply(&add, 5, 3);  // 8
```

**No-parameter function pointers**:

```tuff
fn getZero(): I32 => 0;
let f: || => I32 = &getZero;
```

**C++ codegen**:

- `|I32, I32| => I32` → `int32_t (*)(int32_t, int32_t)`
- Parameter: `f: |I32| => Void` → `void (*f)(int32_t)`

**JS codegen**:

- Function pointers are regular JavaScript function values
- `&funcName` → `funcName` (functions are first-class values)

## Ownership & Borrow Checking

Tuff enforces memory safety at compile-time through ownership and borrow checking, similar to Rust but with raw pointer representation for C/C++ interop.

### Move Semantics

Non-Copy types (structs, arrays) are **moved** on assignment. After a move, the source variable is invalidated:

```tuff
struct Data { value: I32 }

let d = Data { 42 };
let e = d;           // d is moved to e
// d.value;          // ERROR: use of moved value 'd'
e.value              // OK: 42
```

### Copy Types

Primitive types (`I32`, `F64`, `Bool`, etc.) are **copied** instead of moved:

```tuff
let x: I32 = 42;
let y = x;           // x is copied to y
x + y                // OK: both valid, returns 84
```

### Borrow Rules

Borrows are tracked at compile-time to prevent data races:

1. **Multiple shared borrows** (`&x`) are allowed simultaneously
2. **Exclusive mutable borrow** (`&mut x`) requires no other borrows
3. **Cannot use variable directly** while it is mutably borrowed
4. **Borrows end at scope exit**

```tuff
// Multiple shared borrows - OK
let x: I32 = 10;
let p: *I32 = &x;
let q: *I32 = &x;    // OK: multiple shared borrows
*p + *q              // 20

// Exclusive mutable borrow
let mut x: I32 = 42;
let p: *mut I32 = &mut x;
*p = 100;
// let q: *I32 = &x; // ERROR: x is mutably borrowed
*p                   // 100
```

### Scope-Based Borrow Release

Borrows are released when their scope ends:

```tuff
let mut x: I32 = 42;
{
    let p: *mut I32 = &mut x;
    *p = 100;
}  // borrow of x ends here
x  // OK: x is no longer borrowed, returns 100
```

### Whole-Struct Borrowing

Borrowing any field of a struct borrows the entire struct:

```tuff
struct Point { x: I32, y: I32 }

let mut p = Point { 1, 2 };
let px: *mut I32 = &mut p.x;
// let py: *mut I32 = &mut p.y;  // ERROR: p is already borrowed
```

### Dangling Pointer Prevention

The compiler prevents returning pointers to local variables, which would create dangling pointers:

```tuff
fn getDanglingPointer(): *I32 => {
    let x: I32 = 42;
    let p: *I32 = &x;
    return p;  // ERROR: Cannot return pointer to local variable
}
```

The compiler tracks the origin of pointers and ensures that returned pointers don't reference variables that will go out of scope when the function returns. This check is performed at compile-time with no runtime overhead.

### Lifetime Elision

For functions with a single pointer parameter returning a pointer, the lifetime is automatically inferred:

```tuff
// Written (elided):
fn identity(p: *I32): *I32 => p;

// Compiler infers the output shares input's lifetime
```

For multiple pointer parameters returning a pointer, explicit lifetime annotation is required:

```tuff
fn first<a, b>(x: *a I32, y: *b I32): *a I32 => x;
```

### Lifetime Syntax

Lifetimes are declared as lowercase identifiers in generic parameter lists:

```tuff
fn get_ref<a>(p: *a I32): *a I32 => p;
```

- Lifetime params: lowercase (`a`, `b`, `x`)
- Type params: uppercase (`T`, `U`, `Item`)

Pointer types with lifetimes: `*a I32`, `*a mut I32`

### Raw Pointer Representation

Unlike Rust, Tuff pointers are raw pointers with no runtime overhead. The borrow checker operates entirely at compile-time. This enables seamless C/C++ interop while maintaining safety guarantees.

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
- **Generics**: C++ templates (native) / Dynamic typing (JS)
- **Lifetimes**: Required annotations for pointer parameters (Rust-style)

See [ROADMAP.md](ROADMAP.md) for planned features and implementation status.
