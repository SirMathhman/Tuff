# Tuff Language Tutorial

This guide provides an overview of the Tuff programming language syntax and features as currently implemented.

## 1. Variables and Types

Tuff is statically typed. Types can often be inferred, but can also be explicitly specified.

```tuff
// Immutable variable (default)
let x = 10;
let y: I32 = 20;

// Mutable variable
let mut z = 30;
z = 40;

// Basic Types
// I32    : 32-bit signed integer
// F64    : 64-bit floating point
// Bool   : boolean (true/false)
// String : string text
// Void   : empty type
```

## 2. Functions

Functions are declared with the `fn` keyword. They can have block bodies or expression bodies.

```tuff
// Block body
fn add(a: I32, b: I32): I32 => {
    return a + b;
}

// Expression body (concise)
fn multiply(a: I32, b: I32): I32 => a * b;

// Calling functions
let sum = add(5, 10);
```

## 3. Control Flow

Standard control flow structures are supported.

### If-Else

```tuff
if (x > 5) {
    // ...
} else {
    // ...
}
```

### Loops

```tuff
// While loop
while (x > 0) {
    x = x - 1;
}

// Infinite loop
loop {
    if (condition) {
        break;
    }
}
```

## 4. Data Structures

### Structs

Structs are collections of named fields.

```tuff
struct Point {
    x: I32,
    y: I32
}

// Instantiation (positional arguments)
let p = Point { 10, 20 };

// Field access
let x_val = p.x;
```

### Enums

Enums define a set of named variants.

```tuff
enum Color {
    Red,
    Green,
    Blue
}

let c = Color.Red;
```

## 5. Generics

Tuff supports generic functions and structs (monomorphized at compile time).

```tuff
fn identity<T>(val: T): T => val;

let n = identity<I32>(42);
let b = identity<Bool>(true);
```

## 6. Platform Interop (Expect/Actual)

Tuff is designed for multi-platform development. You can define an interface (`expect`) and provide platform-specific implementations (`actual`).

```tuff
// In common code (core/)
expect fn get_platform_name(): String;

// In JavaScript target (js/)
actual fn get_platform_name(): String => "JavaScript";

// In C++ target (cpp/)
actual fn get_platform_name(): String => "C++";
```
