# Tuff Language Tutorial

Welcome to Tuff! This tutorial introduces the Tuff programming language, a statically-typed, multi-platform language that compiles to both JavaScript and C++.

## 1. Variables and Types

Tuff is statically typed with type inference support. Variables are immutable by default.

### Basic Variables

```tuff
// Immutable variable (default)
let x = 10;
let y: I32 = 20;

// Mutable variable
let mut z = 30;
z = 40;
```

### Primitive Types

**Unsigned Integers**: `U8`, `U16`, `U32`, `U64`  
**Signed Integers**: `I8`, `I16`, `I32`, `I64`  
**Floating Point**: `F32`, `F64`  
**Boolean**: `Bool` (values: `true`, `false`)  
**Void**: `Void` (for functions that return nothing)  
**Size**: `USize` (platform-dependent size type)

### Type Aliases

You can define type aliases for complex types:

```tuff
type String = *[U8];
```

## 2. Operators

Tuff supports a comprehensive set of operators:

### Arithmetic Operators

- `+` (addition), `-` (subtraction), `*` (multiplication), `/` (division), `%` (modulo)

### Comparison Operators

- `<`, `>`, `<=`, `>=`, `==`, `!=`

### Logical Operators

- `&&` (logical AND), `||` (logical OR), `!` (logical NOT)

### Bitwise Operators

- `&` (bitwise AND), `|` (bitwise OR), `^` (bitwise XOR)
- `~` (bitwise NOT), `<<` (left shift), `>>` (right shift)

### Type Operators

- `&` (intersection - merge struct values)
- `|` (union - value can be one of multiple types)
- `is` (type checking for union types)

```tuff
// Arithmetic
let sum = 5 + 3;
let product = 4 * 2;

// Comparison
let isGreater = 10 > 5;

// Logical
let both = true && false;

// Bitwise
let masked = 0xFF & 0x0F;

// Type operators (see sections 7 and 8)
```

## 3. Functions

Functions are declared with the `fn` keyword and use the fat arrow `=>` for the body.

### Basic Functions

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

### Generic Functions

Functions can be generic over types:

```tuff
fn identity<T>(val: T): T => val;

let n = identity<I32>(42);
let b = identity<Bool>(true);
```

### Recursive Functions

Functions can call themselves:

```tuff
fn factorial(n: I32): I32 => {
    if (n <= 1)
        return 1;
    else
        return n * factorial(n - 1);
}
```

## 4. Control Flow

### If-Else Statements

`if` can be used as a statement or expression:

```tuff
// Statement form
if (x > 0) {
    y = 100;
} else {
    y = 200;
}

// Expression form (ternary-like)
let result = if (x > 0) 100 else 200;
```

### While Loops

```tuff
let mut i = 0;
while (i < 10) {
    i = i + 1;
}
```

### Loop and Break/Continue

```tuff
// Infinite loop with break
loop {
    if (condition) {
        break;
    }
}

// Continue statement
let mut i = 0;
while (i < 10) {
    i = i + 1;
    if (i == 5)
        continue;
    // Do something
}
```

## 5. Data Structures

### Structs

Structs are collections of named fields:

```tuff
struct Point {
    x: I32,
    y: I32
}

// Instantiation (positional arguments)
let p = Point { 10, 20 };

// Field access
let x_val = p.x;

// Mutable structs
let mut p2 = Point { 0, 0 };
p2.x = 5;
p2.y = 10;
```

### Generic Structs

Structs can be parameterized over types:

```tuff
struct Pair<T, U> {
    first: T,
    second: U
}

let p = Pair<I32, Bool> { 42, true };
```

### Enums

Enums define a set of named variants:

```tuff
enum Color {
    Red,
    Green,
    Blue
}

let c = Color.Red;

// Enums support equality comparison
let same = c == Color.Red;  // true
```

## 6. Pointers and References

Tuff provides low-level memory access through pointers with compile-time safety.

### Pointer Types

- `*T` - Immutable pointer (cannot modify pointee)
- `*mut T` - Mutable pointer (can modify pointee)

### Reference Operators

- `&x` - Create immutable reference to `x`
- `&mut x` - Create mutable reference to `x` (requires `let mut x`)
- `*p` - Dereference pointer to read/write value

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

## 7. Arrays

Arrays are fixed-size collections with initialization tracking.

### Array Literals

```tuff
let arr = [1, 2, 3];        // Type: [I32; 3; 3]
let first = arr[0];          // 1
let second = arr[1];         // 2

// Mutable arrays
let mut arr = [1, 2, 3];
arr[0] = 100;                // Modify element
```

### Array Types

Array types have the form `[Type; Initialized; Capacity]`:

```tuff
let arr: [I32; 3; 5] = [1, 2, 3];  // 3 initialized, capacity 5
```

## 8. Union Types

Union types allow a value to be one of several types:

```tuff
let x: I32 | Bool = 42;

// Type checking with 'is'
if (x is Bool) {
    // x is a Bool here
} else {
    // x is an I32 here
}
```

## 9. Intersection Types

Intersection types merge struct values together:

```tuff
struct Point {
    x: I32,
    y: I32
}

struct Color {
    r: I32,
    g: I32,
    b: I32
}

let pt = Point { 10, 20 };
let col = Color { 255, 128, 0 };

// Merge the two structs using intersection operator
let merged = pt & col;

// Access fields from both component types
let sum = merged.x + merged.y + merged.r + merged.g + merged.b;
```

## 10. Ownership and Borrow Checking

Tuff enforces memory safety through ownership and borrowing rules similar to Rust.

### Move Semantics

Types with destructors (marked with `#`) are moved on assignment. After a move, the source variable cannot be used:

```tuff
// Allocated memory has a destructor (marked with #free)
extern fn malloc(size: USize): *mut [I32] & #free;

let ptr: *mut [I32] & #free = malloc(4);
let ptr2 = ptr;      // ptr is moved to ptr2
// ptr[0] = 42;      // ERROR: use of moved value 'ptr'
```

### Copy Types

Most types (primitives, regular structs, pointers without destructors) are copied instead of moved:

```tuff
let x: I32 = 42;
let y = x;           // x is copied to y
x + y                // OK: both valid
```

### Borrow Rules

1. Multiple shared borrows (`&x`) are allowed simultaneously
2. Exclusive mutable borrow (`&mut x`) requires no other borrows
3. Cannot use variable directly while it is mutably borrowed

```tuff
// Multiple shared borrows - OK
let x: I32 = 10;
let p: *I32 = &x;
let q: *I32 = &x;    // OK

// Exclusive mutable borrow
let mut x: I32 = 42;
let p: *mut I32 = &mut x;
// let q: *I32 = &x; // ERROR: x is mutably borrowed
```

### Dangling Pointer Prevention

The compiler prevents returning pointers to local variables:

```tuff
fn getDanglingPointer(): *I32 => {
    let x: I32 = 42;
    let p: *I32 = &x;
    return p;  // ERROR: x goes out of scope, p would dangle
}
```

## 11. Modules and Namespaces

Tuff organizes code into hierarchical modules using the `::` separator.

### Module Blocks

```tuff
module math {
    fn add(x: I32, y: I32): I32 => x + y;
    fn multiply(x: I32, y: I32): I32 => x * y;
}

// Call with fully qualified name
let result = math::add(5, 3);
```

### Use Declarations

Import modules to access their members:

```tuff
use com::example;

// Now can use com::example members
```

### Fully Qualified Names

All identifiers can be referenced using FQN:

```tuff
let c: Color::Red = Color::Red;  // Enum with FQN
io::println("Hello");             // Function with FQN
```

## 12. Multi-Platform Support (expect/actual)

Tuff supports multi-platform development through `expect`/`actual` declarations.

### Declaring Interfaces

Define the interface in common code:

```tuff
// In core/ directory
expect fn print(message: String): Void;
expect fn io::println(message: String): Void;
```

### Platform-Specific Implementations

Provide implementations for each target:

```tuff
// In js/ directory (JavaScript target)
actual fn print(message: String): Void => {
    // JavaScript implementation
}

// In cpp/ directory (C++ target)
actual fn print(message: String): Void => {
    // C++ implementation
}
```

### Using Platform Code

```tuff
fn main(): Void => {
    print("Hello, Tuff!");
    io::println("Cross-platform!");
}
```

## 13. Advanced Features

### Function Pointers

Function pointers allow passing functions as values:

```tuff
// Function pointer type syntax: |ParamTypes| => ReturnType
let add: |I32, I32| => I32 = &myAdd;

fn myAdd(a: I32, b: I32): I32 => a + b;

// Function that takes a function pointer
fn apply(f: |I32, I32| => I32, x: I32, y: I32): I32 => f(x, y);

fn main(): I32 => {
    let result = apply(&myAdd, 10, 20);
    return result;  // 30
}
```

### SizeOf Operator

Get the size of a type at compile-time:

```tuff
let i32_size: USize = sizeOf(I32);
let u64_size: USize = sizeOf(U64);
let bool_size: USize = sizeOf(Bool);
```

### External Functions

Declare external C/C++ functions:

```tuff
extern fn malloc(size: USize): *mut Void;
extern fn free(ptr: *mut Void): Void;
```

## 14. Comments

```tuff
// Single-line comment

/* Multi-line
   comment */
```

## Next Steps

- Explore the test files in `bootstrap/tests/` to see more examples
- Read [LANGUAGE.md](LANGUAGE.md) for the complete language specification
- Try writing your own Tuff programs and compiling them to JS or C++

## Compilation

Compile Tuff programs using the bootstrap compiler:

```bash
# Compile to JavaScript
tuffc source.tuff js > output.js
node output.js

# Compile to C++
tuffc source.tuff cpp > output.cpp
g++ -std=c++17 output.cpp -o program
./program
```
