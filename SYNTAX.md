# Tuff Language Syntax Specification

**Version:** 0.1.0  
**Status:** MVP Design Phase  
**Last Updated:** December 5, 2025

## Table of Contents

1. [Type System](#type-system)
2. [Functions & Closures](#functions--closures)
3. [Variables & Mutability](#variables--mutability)
4. [Memory Management](#memory-management)
5. [Data Structures](#data-structures)
6. [Control Flow](#control-flow)
7. [Pattern Matching](#pattern-matching)
8. [Error Handling](#error-handling)
9. [Null Safety](#null-safety)
10. [Visibility & Modules](#visibility--modules)
11. [Comments & Strings](#comments--strings)
12. [Type Conversions](#type-conversions)
13. [Operators](#operators)
14. [Deferred Features](#deferred-features)

---

## Type System

### Primitive Types

Tuff uses Rust-style sized integer and floating-point types with capitalization:

```tuff
// Unsigned integers
U8, U16, U32, U64

// Signed integers
I8, I16, I32, I64

// Floating point
F32, F64

// Other primitives
Bool, Char, String, Void
```

### Generic Types

Generics use angle brackets with optional trait bounds:

```tuff
// Simple generic
fn identity<T>(x : T) : T => x;

// With trait bounds
fn process<T : Display>(item : T) : String => { /* ... */ };

// Multiple type parameters
struct Pair<A, B> {
    first : A,
    second : B,
}
```

### Union Types

Union types combine multiple possible types using `|` syntax:

```tuff
type Result<T, E> = Ok<T, E> | Err<T, E>;
type Option<T> = Some<T> | None<T>;

// Pattern matching with is operator
let result : Result<I32, String> = Ok { value: 42 };
let is_ok = result is Ok;
```

### Collections

#### Tuples (Heterogeneous)

Tuples use square brackets without semicolons:

```tuff
let pair : [I32, String] = [42, "hello"];
let first = pair.0;
let second = pair.1;
```

#### Arrays (Homogeneous)

Arrays use square brackets with semicolons. Syntax: `[Type; Init; Length]`

- `Type`: Element type
- `Init`: Number of initialized elements
- `Length`: Total capacity

```tuff
let full : [I32; 3; 3] = [1, 2, 3];      // All 3 initialized
let partial : [I32; 1; 5] = [42, 0, 0, 0, 0];  // 1 init, 4 uninitialized

// Type inference
let arr = [1, 2, 3];  // Inferred as [I32; 3; 3]
```

#### Collections with Generics

```tuff
let nums : Vec<I32> = [1, 2, 3];
let map : HashMap<String, I32> = { "a": 1, "b": 2 };
let opt : Option<String> = Some { value: "hello" };
```

---

## Functions & Closures

### Function Declarations

Functions use `fn` keyword with arrow syntax and implicit return:

```tuff
fn add(first : I32, second : I32) : I32 => first + second;

fn greet(name : String) : String => {
    "Hello, " + name
};

// Multiple statements
fn calculate(x : I32) : I32 => {
    let doubled = x * 2;
    doubled + 1
};
```

**Key Points:**
- Explicit return types required
- Implicit return from last expression
- No explicit `return` keyword needed (but allowed)
- Arrow `=>` before body (inspired by lambda syntax)

### Closures

Closures capture their defining environment and use parentheses:

```tuff
let add = (a : I32, b : I32) : I32 => { a + b };
let add = (a : I32, b : I32) : I32 => a + b;  // Single expression

// Closures can capture variables from outer scope
let multiplier : I32 = 3;
let multiply = (x : I32) : I32 => x * multiplier;

// Use in higher-order functions
nums.map((x : I32) : I32 => x * 2);
```

### Function Pointers

Function pointers are explicitly typed and don't capture environment:

```tuff
fn pure_add(a : I32, b : I32) : I32 => a + b;

// Function pointer type: |I32, I32| => I32
let fn_ptr : |I32, I32| => I32 = pure_add;

// Use the pointer
let result = fn_ptr(5, 3);
```

### Methods

Methods are defined in `impl` blocks using `this` and `ThisType`:

```tuff
struct Point {
    x : I32,
    y : I32,
}

impl Point {
    fn distance(this) : I32 => {
        (this.x * this.x + this.y * this.y) as I32
    }
    
    fn translate(mut this, dx : I32, dy : I32) : ThisType => {
        this.x = this.x + dx;
        this.y = this.y + dy;
        this
    }
}

let p = Point { x: 3, y: 4 };
let dist = p.distance();
let moved = p.translate(1, 2);  // Method chaining
```

---

## Variables & Mutability

### Declarations

Variables are immutable by default:

```tuff
let x : I32 = 5;        // Immutable
let mut y : I32 = 10;   // Mutable

y = 20;  // OK
x = 15;  // ERROR: x is immutable
```

### Type Inference

Type annotations are required (no global type inference in MVP):

```tuff
let x : I32 = 5;           // OK
let x = 5;                  // ERROR: type required
```

### Scoping

Variables are lexically scoped. No shadowing allowed:

```tuff
let x = 5;
{
    let x = 10;  // ERROR: x already declared in scope
}
```

### Compiler-Inferred Constants

Immutable values are compiler-optimized as constants when possible:

```tuff
let MAX_SIZE = 1024;  // Compiler treats as constant
let FLAGS = [1, 2, 3];  // Also constant-optimized
```

---

## Memory Management

### Ownership & Borrowing

Tuff uses Rust-style ownership with move semantics:

```tuff
let s1 = String::from("hello");
let s2 = s1;  // s1 is moved, now invalid
// println!("{}", s1);  // ERROR: use after move
```

### Immutable References

Borrow with `&` for read-only access:

```tuff
let s = String::from("hello");
let r1 : &String = &s;
let r2 : &String = &s;
// Multiple immutable borrows OK
```

### Mutable References

Borrow with `&mut` for exclusive write access:

```tuff
let mut s = String::from("hello");
let r : &mut String = &mut s;
r.push_str(" world");
// Only one mutable reference allowed in scope
```

### Pointers

Dereference with `*` operator:

```tuff
let x : I32 = 42;
let r : *I32 = &x;        // Pointer type with *
let y : I32 = *r;         // Explicit dereference with *
```

### Lifetimes

Mix of explicit and implicit lifetimes:

```tuff
// Simple case, lifetime inferred
fn borrow(s : &String) : &String => { s }

// Complex case, explicit lifetime required
fn longest<'a>(s1 : &'a String, s2 : &'a String) : &'a String => {
    if s1.len() > s2.len() { s1 } else { s2 }
}
```

---

## Data Structures

### Structs

Structs group related data with named fields:

```tuff
struct Point {
    x : I32,
    y : I32,
}

struct User {
    name : String,
    age : I32,
}

// Construction
let p = Point { x: 5, y: 10 };
let u = User { name: "Alice", age: 30 };

// Field access
let x_coord = p.x;
```

### Traits

Traits define shared behavior:

```tuff
trait Drawable {
    fn draw(this) : String;
    fn get_size(this) : I32;
}

trait Container<T> {
    fn add(mut this, item : T) : Void;
    fn len(this) : I32;
}
```

### Trait Implementations

Implement traits for types:

```tuff
impl Drawable for Point {
    fn draw(this) : String => {
        format!("Point({}, {})", this.x, this.y)
    }
    
    fn get_size(this) : I32 => 1
}

// Implement for generic types
impl<T : Display> Drawable for Container<T> {
    fn draw(this) : String => { /* ... */ }
    
    fn get_size(this) : I32 => this.len()
}
```

### Composition Over Inheritance

Tuff uses struct composition rather than inheritance:

```tuff
struct ColoredPoint {
    point : Point,     // Embed struct
    color : String,
}

// Reuse with explicit forwarding
let cp = ColoredPoint { 
    point: Point { x: 5, y: 10 }, 
    color: "red" 
};
```

---

## Control Flow

### If/Else Expressions

If/else returns a value:

```tuff
let max = if x > y { x } else { y };

let classification = if score >= 90 {
    "A"
} else if score >= 80 {
    "B"
} else {
    "C"
};
```

### While Loops

```tuff
let mut count = 0;
while count < 10 {
    count = count + 1;
}
```

### For-In Loops

Iterate over iterables:

```tuff
for item in collection {
    println!("{}", item);
}

for i in [1, 2, 3] {
    println!("{}", i);
}

for ch in "hello" {
    println!("{}", ch);
}
```

### Break and Continue

```tuff
for i in [1, 2, 3, 4, 5] {
    if i == 2 {
        continue;  // Skip to next iteration
    }
    if i == 4 {
        break;     // Exit loop
    }
}
```

### Ternary Operator

```tuff
let result = condition ? true_value : false_value;
let abs = x >= 0 ? x : -x;
```

---

## Pattern Matching

### Match Expressions

Match must be exhaustive—all patterns required:

```tuff
match result {
    Ok { value } => println!("Success: {}", value),
    Err { error } => println!("Error: {}", error),
}

// Default pattern
match value {
    Some { value: 0 } => println!("Zero"),
    Some { value } => println!("Non-zero: {}", value),
    None => println!("No value"),
}
```

### Type Checking with `is`

```tuff
let result : Result<I32, String> = Ok { value: 42 };
let is_ok = result is Ok;
let is_err = result is Err;

if result is Ok {
    // Handle success
}
```

---

## Error Handling

### Result Type

Use Result for recoverable errors:

```tuff
type Result<T, E> = Ok<T, E> | Err<T, E>;

fn divide(a : I32, b : I32) : Result<I32, String> => {
    if b == 0 {
        Err { error: "Division by zero" }
    } else {
        Ok { value: a / b }
    }
}

// Usage
match divide(10, 2) {
    Ok { value } => println!("Result: {}", value),
    Err { error } => println!("Error: {}", error),
}
```

### Error Propagation (Future)

The `?` operator will propagate errors (Phase 2):

```tuff
fn process() : Result<String, Error> => {
    let value = risky_operation()?;  // Propagates on Err
    Ok { value: process_value(value) }
}
```

---

## Null Safety

### Option Type

Use Option for optional values:

```tuff
type Option<T> = Some<T> | None<T>;

let maybe_value : Option<String> = Some { value: "hello" };
let nothing : Option<String> = None;

// Pattern matching
match maybe_value {
    Some { value } => println!("Value: {}", value),
    None => println!("No value"),
}
```

### Void Type

Use Void for functions with no meaningful return:

```tuff
fn print_message(msg : String) : Void => {
    println!("{}", msg);
}
```

---

## Visibility & Modules

### Visibility Keywords

- Private by default
- `out` makes items publicly visible
- `in` designates module-level input parameters

```tuff
// Private (default)
fn private_fn() : Void => { }

// Public
out fn public_fn() : Void => { }

// Module input parameter
in let config_value : I32;
```

### Module System

Modules are created with the `module` keyword (optional for files):

```tuff
// src/utils/math.rs - file is implicitly a module

module arithmetic {
    fn add(a : I32, b : I32) : I32 => a + b
}

out fn multiply(a : I32, b : I32) : I32 => a * b
```

### Imports

Import items from modules:

```tuff
from std::collections use { Vec, HashMap };
from utils::math use { add, multiply };
from utils use *;  // Import all public items
```

### Module Parameters (GLSL-inspired)

Modules can have input parameters:

```tuff
// shader_module.tuff
in let screen_width : I32;
in let screen_height : I32;

out fn get_aspect_ratio() : F64 => {
    (screen_width as F64) / (screen_height as F64)
}

// Usage
from shader_module { screen_width = 1920, screen_height = 1080 } use get_aspect_ratio;
```

---

## Comments & Strings

### Line Comments

```tuff
// This is a line comment
let x = 5;  // Inline comment
```

### Block Comments

```tuff
/* This is a block comment
   spanning multiple lines */
```

### Documentation Comments

```tuff
/** 
 * Adds two numbers together.
 * 
 * This function takes two I32 values and returns their sum.
 */
fn add(a : I32, b : I32) : I32 => a + b;
```

### String Literals

```tuff
let s1 = "double quoted";
let s2 = 'single quoted';
let s3 = "with escape: \n newline";
```

### String Interpolation (Deferred)

String interpolation will be designed in Phase 3 with stdlib.

---

## Type Conversions

### Explicit Conversion Methods

Use method calls for type conversions:

```tuff
let x : F64 = 3.14;
let y : I32 = x.to_i32();  // 3

let num : I32 = 42;
let s : String = num.to_string();

let b : Bool = true;
let s : String = b.to_string();  // "true"
```

**Common Methods:**
- `.to_i8()`, `.to_i16()`, `.to_i32()`, `.to_i64()`
- `.to_u8()`, `.to_u16()`, `.to_u32()`, `.to_u64()`
- `.to_f32()`, `.to_f64()`
- `.to_string()`
- `.to_bool()`

---

## Operators

### Arithmetic Operators

```tuff
a + b   // Addition
a - b   // Subtraction
a * b   // Multiplication
a / b   // Division
a % b   // Modulo
```

### Comparison Operators

```tuff
a == b  // Equality
a != b  // Inequality
a < b   // Less than
a > b   // Greater than
a <= b  // Less than or equal
a >= b  // Greater than or equal
```

### Logical Operators

```tuff
a && b  // Logical AND
a || b  // Logical OR
!a      // Logical NOT
```

### Bitwise Operators (TBD)

Reserved for Phase 2.

### Operator Overloading

**Not supported.** Operators have fixed meanings reflecting hardware operations. This ensures predictability in systems code.

---

## Deferred Features

These features are intentionally deferred for later phases:

### Async/Await (Phase 4)

Async/await will have novel syntax for bare-metal environments. Traditional syntax won't work for embedded/kernel development.

### Attributes & Macros (Phase 2)

Compile-time metaprogramming with attributes will be designed in Phase 2.

### Variadic Functions (Future)

Support for variable-argument functions deferred pending design decisions.

### Platform Conditional Compilation (Phase 2+)

Multi-target code selection deferred for thorough design.

### Advanced Generic Features (Phase 2+)

- Associated types
- Higher-ranked trait bounds
- Type families

### Default Parameters (Not Supported)

Incompatible with first-class functions. Use function overloading or Option types instead.

### String Interpolation (Phase 3)

Deferred to stdlib design phase to clarify memory allocation semantics.

---

## Grammar Summary

### Top-Level Declarations

```
program     → declaration* EOF
declaration → module_decl | function_decl | struct_decl | trait_decl | impl_decl | type_alias | statement
```

### Function Declaration

```
function_decl → "fn" identifier "(" parameters ")" ":" type "=>" block ";"
parameters   → (parameter ("," parameter)*)? 
parameter    → identifier ":" type
```

### Type Annotation

```
type        → type_name
           | type_name "<" type ("," type)* ">"
           | "&" type | "*" type
           | "[" type "]"                    // Tuple
           | "[" type ";" number ";" number "]"  // Array
           | type "|" type                   // Union
           | "|" type ("," type)* "|" "=>" type  // Function pointer
```

### Expression

```
expression  → ternary
ternary     → logical_or ("?" expression ":" expression)?
logical_or  → logical_and ("||" logical_and)*
logical_and → equality ("&&" equality)*
equality    → comparison (("==" | "!=") comparison)*
comparison  → addition (("<" | ">" | "<=" | ">=") addition)*
addition    → multiplication (("+" | "-") multiplication)*
multiplication → unary (("*" | "/" | "%") unary)*
unary       → ("!" | "-" | "*" | "&") unary | postfix
postfix     → primary ("(" arguments ")" | "[" expression "]" | "." identifier)*
primary     → number | string | identifier | "(" expression ")" | "[" expression_list "]"
```

---

## Example Program

```tuff
/** Calculate the Fibonacci sequence */
fn fibonacci(n : U32) : U32 => {
    if n <= 1 {
        n
    } else {
        fibonacci(n - 1) + fibonacci(n - 2)
    }
};

/** Process a list of numbers */
fn process_numbers(numbers : Vec<I32>) : I32 => {
    let mut sum : I32 = 0;
    
    for num in numbers {
        sum = sum + num;
    }
    
    sum
};

struct Calculator {
    base : I32,
}

impl Calculator {
    fn add(mut this, value : I32) : ThisType => {
        this.base = this.base + value;
        this
    }
    
    fn multiply(mut this, value : I32) : ThisType => {
        this.base = this.base * value;
        this
    }
    
    fn result(this) : I32 => this.base
}

fn main() : Void => {
    let fib_10 = fibonacci(10);
    
    let numbers = [1, 2, 3, 4, 5];
    let sum = process_numbers(numbers);
    
    let calc = Calculator { base: 10 }
        .add(5)
        .multiply(2)
        .result();
};
```

---

## Notes for Implementation

1. **Static Type Checking**: Type system is checked before execution (Phase 2)
2. **Ownership Validation**: Borrow checker validates references (Phase 2)
3. **Exhaustiveness**: Pattern matching requires all cases (built-in)
4. **No Runtime Reflection**: All generics erased at compile time
5. **Platform Agnostic**: Syntax is portable; implementation details vary per target
