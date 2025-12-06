# Tuff Language Specification

Tuff is a statically-typed, imperative programming language with support for closures, object-oriented programming, and automatic memory management through drop handlers.

## Table of Contents

1. [Basic Syntax](#basic-syntax)
2. [Types](#types)
3. [Variables](#variables)
4. [Functions](#functions)
5. [Control Flow](#control-flow)
6. [Object-Oriented Programming](#object-oriented-programming)
7. [Pointers and References](#pointers-and-references)
8. [Drop Handlers](#drop-handlers)
9. [Operators](#operators)

---

## Basic Syntax

### Comments

```rust
// Single-line comments (when implemented)
```

### Statements

Statements are separated by semicolons:

```rust
let x = 100;
let y = 200;
x + y
```

### Blocks

Blocks are expressions that return the value of their last expression:

```rust
let result = {
    let x = 10;
    let y = 20;
    x + y  // returns 30
};
```

---

## Types

### Numeric Types

- **I8**: 8-bit signed integer (-128 to 127)
- **I32**: 32-bit signed integer (default for integers)
- **U8**: 8-bit unsigned integer (0 to 255)

```rust
let a : I8 = 100I8;
let b : I32 = 42;
let c : U8 = 255U8;
```

### Type Inference

Types can be inferred from literals or explicitly declared:

```rust
let x = 100;        // inferred as I32
let y : I8 = 50I8;  // explicit type annotation
```

### Type Aliases

Create aliases for existing types:

```rust
type MyInt = I32;
let x : MyInt = 100;
```

### Struct Types

Define custom data structures:

```rust
struct Point {
    x : I32,
    y : I32
}

let p = Point { x: 3, y: 4 };
```

---

## Variables

### Declaration

```rust
let x = 100;           // immutable variable
let mut y = 200;       // mutable variable
let z : I32 = 300;     // with explicit type
```

### Assignment

```rust
let mut x = 100;
x = 200;               // simple assignment
x += 50;               // compound assignment (+=, -=, *=, /=)
```

### Scope

Variables are scoped to their containing block:

```rust
let x = 100;
{
    let x = 200;  // shadows outer x
    x             // 200
}
x                 // 100
```

---

## Functions

### Named Functions

```rust
fn add(a : I32, b : I32) : I32 => a + b
```

### Function Bodies

Functions can have expression or block bodies:

```rust
// Expression body
fn double(x : I32) => x * 2

// Block body
fn compute(x : I32) : I32 => {
    let temp = x * 2;
    temp + 10
}
```

### Closures

Functions can capture variables from their environment:

#### Automatic Capture (Immutable)

```rust
let x = 100;
fn get() => x;  // automatically captures &x
get()           // returns 100
```

#### Automatic Mutable Capture

```rust
let mut x = 0;
fn increment() => x = x + 1;  // automatically captures &mut x
increment();
x  // returns 1
```

#### Explicit Capture Syntax

```rust
fn getter[&x]() => x;        // immutable capture
fn setter[&mut x]() => x;    // mutable capture
```

### Arrow Functions

Anonymous functions can be assigned to variables:

```rust
let f = () => 100;
let g : (I32) => I32 = (x : I32) => x * 2;
```

### Higher-Order Functions

Functions can return other functions:

```rust
fn make() => fn inner() => 100;
make()()  // returns 100
```

### Return Statements

Explicit early return from functions:

```rust
fn check(x : I32) : I32 => {
    if (x < 0) {
        return 0;
    }
    x * 2
}
```

---

## Control Flow

### If/Else

```rust
if (x > 0) {
    100
} else {
    200
}
```

If expressions return values:

```rust
let result = if (x > 0) { x } else { 0 };
```

Single-statement form:

```rust
if (x > 0) x = x * 2;
```

### While Loops

```rust
let mut i = 0;
while (i < 10) {
    i += 1;
}
```

---

## Object-Oriented Programming

### Classes (Syntactic Sugar)

The `class` keyword is syntactic sugar for constructors that return `this`:

```rust
class fn Point(x : I32, y : I32) => {
    fn manhattan() => x + y;
}
```

Is equivalent to:

```rust
fn Point(x : I32, y : I32) => {
    fn manhattan() => x + y;
    this
}
```

### Constructors

Constructors are functions that capture parameters and define methods:

```rust
fn Rectangle(width : I32, height : I32) => {
    fn area() => width * height;
    fn perimeter() => (width + height) * 2;
    this
}

let rect : Rectangle = Rectangle(5, 3);
rect.area()       // returns 15
rect.perimeter()  // returns 16
```

### Property Access

Access fields and methods on objects:

```rust
let p : Point = Point(3, 4);
p.x              // field access
p.manhattan()    // method call
```

### The `this` Keyword

`this` represents the current object being constructed:

```rust
fn Counter(initial : I32) => {
    fn get() => initial;
    this
}
```

### Method Binding

Methods automatically capture constructor parameters:

```rust
class fn Point(x : I32, y : I32) => {
    fn getX() => x;      // captures x
    fn distance() => {   // captures both x and y
        let dx = x * x;
        let dy = y * y;
        dx + dy
    };
}
```

---

## Pointers and References

### Address-of Operator

Get a reference to a variable:

```rust
let x = 100;
let y = &x;      // immutable reference
let mut z = 200;
let w = &mut z;  // mutable reference
```

### Dereference Operator

Access the value through a reference:

```rust
let x = 100;
let y = &x;
*y               // returns 100
```

### Mutable Borrow Rules

Only one mutable reference can exist at a time:

```rust
let mut x = 100;
let y = &mut x;  // OK
let z = &mut x;  // Error: x is already mutably borrowed
```

---

## Drop Handlers

### Declaring Drop Handlers

Types can have automatic cleanup functions:

```rust
type DroppableI32 = I32!drop;

fn drop(x : I32) : I32 => {
    // cleanup code
    x
}
```

### Automatic Invocation

Drop handlers are called automatically when variables go out of scope:

```rust
{
    let x : DroppableI32 = 100;
    // ... use x ...
}  // drop(x) is called here automatically
```

---

## Operators

### Arithmetic Operators

```rust
x + y    // addition
x - y    // subtraction
x * y    // multiplication
x / y    // division
x % y    // modulus
```

### Compound Assignment

```rust
x += y   // x = x + y
x -= y   // x = x - y
x *= y   // x = x * y
x /= y   // x = x / y
```

### Comparison Operators

```rust
x == y   // equality
x != y   // inequality
x < y    // less than
x > y    // greater than
x <= y   // less than or equal
x >= y   // greater than or equal
```

### Operator Precedence

1. Parentheses `()`
2. Unary operators `*`, `&`
3. Multiplication/Division `*`, `/`, `%`
4. Addition/Subtraction `+`, `-`
5. Comparison `<`, `>`, `<=`, `>=`
6. Equality `==`, `!=`

---

## Examples

### Complete Program Examples

#### 1. Simple Calculator

```rust
fn add(a : I32, b : I32) => a + b;
fn multiply(a : I32, b : I32) => a * b;

let result = add(10, multiply(3, 4));
result  // returns 22
```

#### 2. Counter Object

```rust
class fn Counter(initial : I32) => {
    fn increment() => initial = initial + 1;
    fn decrement() => initial = initial - 1;
    fn get() => initial;
}

let mut c : Counter = Counter(0);
c.increment();
c.increment();
c.get()  // returns 2
```

#### 3. Point with Methods

```rust
class fn Point(x : I32, y : I32) => {
    fn manhattan() => x + y;
    fn euclidean() => {
        let dx = x * x;
        let dy = y * y;
        dx + dy  // returns squared distance
    };
}

let p : Point = Point(3, 4);
p.manhattan()   // returns 7
p.euclidean()   // returns 25
```

#### 4. Closure Example

```rust
let x = 100;
let y = 200;

fn compute() => {
    let sum = x + y;
    sum * 2
}

compute()  // returns 600
```

#### 5. Higher-Order Functions

```rust
fn makeMultiplier(factor : I32) => {
    fn multiply(x : I32) => x * factor;
    multiply
}

let double : (I32) => I32 = makeMultiplier(2);
double(5)  // returns 10
```

---

## Language Implementation Notes

### Internal Representations

#### Function Values

Functions are stored with format: `params|return_type|body` or `captures|params|return_type|body`

#### Struct Values

Structs are encoded as: `__STRUCT__:TypeName|field=value|__fn__method=encoded_fn|...`

#### Captured Variables

Captures are stored as: `&x, &mut y` indicating immutable and mutable borrows

### Type Suffixes

Literals can have type suffixes:

- `100I32` - 32-bit signed integer
- `50I8` - 8-bit signed integer
- `255U8` - 8-bit unsigned integer

### Special Variable Prefixes

- `__fn__<name>` - Function definitions
- `__captures__<name>` - Capture specifications
- `__struct__<name>` - Struct definitions
- `__drop__<type>` - Drop handler functions

---

## Future Enhancements

Potential features for future development:

- Boolean type (`Bool`)
- String type
- Arrays and collections
- Pattern matching
- Enums/Sum types
- Traits/Interfaces
- Generics
- Module system
- Standard library

---

## Error Messages

Tuff provides descriptive error messages:

```rust
// Undeclared variable
x + 100  // Error: assignment-to-undeclared-variable: x

// Type mismatch
let x : I8 = 200I8  // Error: integer overflow: 200 exceeds I8 range

// Double borrow
let mut x = 100;
let y = &mut x;
let z = &mut x;  // Error: variable x is already mutably borrowed
```

---

## Conclusion

Tuff is a practical language that combines:

- Static typing with inference
- Functional programming features (closures, higher-order functions)
- Object-oriented programming (classes, methods)
- Memory safety (borrow checking, drop handlers)
- Clean, expressive syntax

The language is designed to be easy to learn while providing powerful features for building complex programs.
