# Tuff — Language Overview

Welcome to Tuff — a modern, safe, and expressive programming language for systems and application development. This document is a living specification and guide: it captures design goals, syntax and language features, examples, tooling, and contribution guidelines.

## Vision and Design Goals

- Safety: minimize undefined behavior and make common errors explicit.
- Performance: produce efficient compiled binaries with predictable performance.
- Simplicity: keep syntax approachable and orthogonal.
- Interoperability: provide integration points with existing ecosystems.

## Bootstrap Version

This document describes the **bootstrap version** of Tuff. The bootstrap version features a **garbage-collected runtime** to prioritize simplicity and ease of initial implementation. This allows the language to be usable and expressive without the complexity of manual memory management.

In future versions, Tuff will be extended with more advanced memory management semantics (such as ownership, borrowing, and lifetime rules) to enable deterministic resource cleanup and improved performance in systems programming contexts. These enhancements will be layered on top of the bootstrap semantics described here.

The bootstrap version is feature-complete for most application programming tasks and serves as a solid foundation for the language's evolution.

## Quick Start

This is a high-level reference — if your project has an actual compiler or runtime, replace the command names below (`tuffc`, `tuff`) with your tools.

1. Install the Tuff compiler (placeholder):

```sh
# On Windows/macOS/Linux — placeholder
curl -sSL https://example.org/install-tuff | sh
```

2. Compile a program:

```sh
tuffc hello.tuff -o hello
./hello
```

## Source File Layout

Tuff source files typically end with `.tuff`. A top-level source file may contain imports, top-level type declarations, functions, and constants.

```tuff
// file: hello.tuff
import std.io

fn main() {
    io.print("Hello, Tuff!\n")
}
```

## Syntax Overview

- Statements are terminated by newline or semicolon.
- Blocks use `{` and `}`.
- Indentation is not significant (like C/Go/Rust).

### Comments

Tuff supports two types of comments:

#### Line comments

Line comments start with `//` and extend to the end of the line. Everything after `//` is ignored by the compiler:

```tuff
let x = 10;  // This is a comment
// This entire line is a comment
let y = x + 5;  // Add 5 to x
```

#### Block comments

Block comments start with `/*` and end with `*/`. They can span multiple lines and can be nested:

```tuff
/* This is a block comment */

let x = 10;  /* inline comment */

/*
 * Multi-line comment
 * explaining the logic below
 */
let y = x + 5;

/* Nested /* block */ comments */
```

Comments are useful for documenting code, explaining complex logic, or temporarily disabling code during development.

### Block expressions (braces semantics)

Blocks behave like in C for control flow and scoping, but blocks can also be used as expressions in Tuff. A block expression evaluates to the value of its final expression if that last expression is written without a trailing semicolon (like Rust). If the last statement is terminated by a semicolon, the block does not produce a value and therefore cannot be used in an initializer position or other expression contexts that require a value.

Examples:

```tuff
let x = { let y = 100; y }; // OK: block evaluates to the value of `y` (I32 by default)

let x = { let y = 100; }; // Error: block doesn't produce a value — last statement has a semicolon.

// Nested blocks and returned values:
let z = { let a = 1; { let b = 2; b } } // z is 2 (no semicolons on final expressions)
```

When using block expressions, the returned value of the block is subject to the usual type inference and checking rules: the block's type is the type of the final expression (when present), and it must be compatible with the context (e.g., assigned variable type).

### Variables and Mutability

Variables are immutable by default. Use `let mut` to make a variable mutable.

- Typed variable declaration:

```tuff
let myLocalVar : U32 = 100;
```

- Type inference:

```tuff
let myLocalVar = 100; // type inferred by the compiler — unsuffixed integer literals default to I32 unless context dictates otherwise
```

- Scoping/uniqueness rule: you cannot declare two variables with the same name in the same lexical scope or any enclosing/nested scope — shadowing is not allowed. Redeclaring a name in any parent or child scope will cause a compile-time error.

  Example:

  ```tuff
  let x = 1;
  {
      let x = 2; // Error: cannot declare variable `x` here — name already exists in an enclosing scope
  }
  ```

- Example (mutable):

```tuff
let mut counter : I32 = 0;
counter = counter + 1;
```

- Assignment rule: only variables declared `mut` can be reassigned. Attempting to reassign an immutable `let` variable is a compile-time error:

```tuff
let x = 100;
x = 20; // Error: cannot assign to immutable variable `x`

let mut y = 100;
y = 20; // OK
```

Note: semicolons are optional at the end of lines in many contexts; they are shown here for clarity.

## Type System

Tuff provides primitive types and composite types.

### Primitive types

The following primitive types are supported:

- Unsigned integers: `U8`, `U16`, `U32`, `U64`
- Signed integers: `I8`, `I16`, `I32`, `I64`
- Floating point: `F32`, `F64`
- Boolean: `Bool`
- Character: `Char`
- String: `String`
- Void: `Void` (represents no value; used as return type for functions that don't produce a value)

```tuff
let pi: F32 = 3.14159
let count: U32 = 100
let name: String = "Tuff"

fn doSomething() : Void => {
    // function that doesn't return a value
}
```

### Numeric literals and default typing

Integer and floating-point literal types follow simple, predictable rules:

- Unsuffixed integer literals are by default `I32`.
- If an unsuffixed integer literal appears in a context requiring a different integer type (e.g., initializing a variable with a typed declaration or participating in an arithmetic expression with a typed operand), it will be inferred to match that type.
- Integer literals may include an explicit type suffix to disambiguate, e.g., `10U8`, `255U16`, `-5I8`.
- Unsuffixed floating-point literals are `F32` by default; they can be suffixed as `F32` or `F64` if needed.

Examples:

```tuff
let a: U32 = 100;        // `100` inferred as U32, with runtime/compile-time range check
let b = 100;             // `b` inferred as I32 (default)
let c = 10U8 + 100;      // `100` inferred as U8 because `10U8` is explicitly U8; result is U8
let d = 3.14;            // `d` inferred as F32 (default float type)
let e = 3.14F32;         // `e` explicitly F32
```

### Arrays

Arrays use an explicit initialized count as part of their type, in the format `[Type; Initialized; Length]`.

- `Type` is the element type.
- `Initialized` is an integer literal indicating how many elements have been initialized (must be between 0 and `Length`) and is always interpreted as a contiguous prefix count starting at index 0, i.e., indices `[0, Initialized)` are initialized.
- `Length` is the compile-time fixed length of the array.

The initialized tracker provides safety guarantees: you cannot access elements beyond the declared `Initialized` count. Attempting to read an element that hasn't been initialized is a compile-time error. You also cannot initialize an element out-of-order — initializing `array[i]` where `i` > `Initialized` is a compile-time error. This prevents accessing uninitialized memory and common indexing mistakes.

Examples:

```tuff
// Fully-initialized array, all elements are initialized
let arr: [U8; 3; 3] = [1, 2, 3];

// Partially initialized array; only elements 0 and 1 are initialized
let mut buf: [U8; 2; 5] = [10, 20];

// Error: cannot read uninitialized element 2
// let x = buf[2]; // compile-time error: element not initialized

// Illegal: cannot jump ahead to assign index 4 before prior elements are initialized
// buf[4] = 77; // compile-time error: cannot initialize element 4 before elements 0..3 are initialized

// OK: assign the next element in order
buf[2] = 30; // now initialized becomes 3
let y: U8 = buf[2];

// Out-of-bounds checks still apply: index must be < Length
// buf[5] = 1; // compile-time error: index out of bounds
```

Note: The language may provide conveniences for default initialization (e.g., zero initialization or `Default::default()`), but the default safe behavior is to track explicit initialization counts to avoid accidental undefined behavior.

### Slices

A slice is a dynamic, runtime view into a contiguous array (or similar buffer). Slices are written as `*[Type]` and include three runtime components:

- a pointer to the element data
- `initialized`: how many elements (from index 0) have been initialized
- `length`: the total capacity/length of the backing array

Slices are typically created from arrays. Example:

```tuff
let arr: [U8; 3; 3] = [1, 2, 3];
let s: *[U8] = &arr; // implicit conversion from array to slice; s.initialized == 3, s.length == 3
```

Rules for slices:

- Reading from a slice index `s[i]` requires that `i < s.initialized`, otherwise it's a runtime or compile-time error (depending on the analyzer level).
- Writing to a slice `s[i]` updates the underlying buffer and may increase `s.initialized`, but only when writing the next contiguous element (i.e., `i == s.initialized`); writing at an index greater than `s.initialized` (skipping elements) is a compile-time error. Assignments to indices `< s.initialized` are allowed to update existing elements.
- Slices do not own the data; they are a view. Lifetime/borrowing rules ensure an array cannot be deallocated while there are live slices pointing to it.
- Slices support iteration and can be passed to functions expecting a `*[Type]`.

Example illustrating assign and read via a slice:

```tuff
let mut buf: [U8; 2; 5] = [10, 20];
let mut s: *[U8] = &buf; // array to slice via `&` operator
s[2] = 30; // now s.initialized becomes 3 and buf[2] is 30
let x: U8 = s[1]; // 20
```

The precise semantics for lifetime, aliasing, and borrow-check rules will be defined in the safety and ownership sections, but slices are designed to enforce safety via `initialized` and `length` tracking at runtime or compile-time where possible.

### Structs

Structs are named composite types that group multiple fields together. A struct is declared with the `struct` keyword, followed by the struct name and a list of named fields with their types.

Syntax:

```tuff
struct Point {
    x : I32,
    y : I32
}
```

Struct instantiation uses positional arguments within braces (the field names are part of the type definition, not part of the instantiation):

```tuff
let p = Point { 3, 4 };  // instantiate with positional args
```

Field access is done using dot notation:

```tuff
let p = Point { 5, 10 };
let x_coord : I32 = p.x;
let y_coord : I32 = p.y;
io.print(x_coord); // 5
```

Structs are immutable by default. To modify a field, the struct variable must be declared as `let mut`:

```tuff
let mut p = Point { 1, 2 };
p.x = 10;  // OK because p is mutable
p.y = 20;

let p2 = Point { 3, 4 };
// p2.x = 5;  // Error: cannot assign to field of immutable struct
```

Structs can contain other structs:

```tuff
struct Rectangle {
    top_left : Point,
    bottom_right : Point
}

let rect = Rectangle {
    Point { 0, 0 },
    Point { 100, 100 }
};
let tl_x : I32 = rect.top_left.x;
```

Struct types are used throughout the language for grouping related data. They integrate with the type system and participate in type inference and checking like other types.

### Tuples

Tuples are lightweight, anonymous composite types that group multiple values together. Unlike structs, tuples don't require field names — values are accessed by position.

#### Tuple syntax

A tuple type is written as `(Type1, Type2, ...)` and a tuple value is created using the same syntax with expressions:

```tuff
let pair: (I32, String) = (42, "hello");
let triple: (Bool, F32, U8) = (true, 3.14, 255);
```

#### Accessing tuple elements

Elements are accessed using dot notation with a zero-based index:

```tuff
let person: (String, I32) = ("Alice", 30);
let name = person.0;   // "Alice"
let age = person.1;    // 30

io.print(name);
io.print(age);
```

#### Type inference with tuples

Tuple types can be inferred from the tuple literal:

```tuff
let data = (100, "test", true);  // type inferred as (I32, String, Bool)
let first = data.0;              // I32
let second = data.1;             // String
let third = data.2;              // Bool
```

#### Nested tuples

Tuples can contain other tuples:

```tuff
let nested: ((I32, I32), String) = ((10, 20), "point");
let coords = nested.0;       // (I32, I32)
let x = nested.0.0;         // 10
let y = nested.0.1;         // 20
let label = nested.1;       // "point"
```

Tuples are useful for returning multiple values from a function without declaring a struct:

```tuff
fn divmod(a: I32, b: I32) : (I32, I32) => {
    (a / b, a % b)
}

let (quotient, remainder) = divmod(17, 5);
// quotient is 3, remainder is 2
```

### Type aliases

Type aliases allow you to create an alternative name for an existing type. This is useful for improving code readability and reducing repetition, especially with complex types.

Syntax:

```tuff
type MyType = I32;
type Coordinate = (I32, I32);
type Handler = (String) => Bool;
```

Once a type alias is defined, you can use it anywhere a type is expected:

```tuff
type UserId = U64;
type Result<T> = Option<T>;

let user_id: UserId = 12345;
fn process_user(id: UserId) : Bool => {
    // implementation
}

let coords: Coordinate = (10, 20);
let handlers: [Handler; 2; 2] = [fn1, fn2];
```

Type aliases are purely for clarity and convenience — they don't create new types. They are fully interchangeable with their underlying types:

```tuff
type Count = I32;
let a: Count = 5;
let b: I32 = a;  // OK: Count and I32 are the same type
```

### Union types (sum types)

Unions (also called sum types or tagged unions) allow you to define a type that can be one of several variants. Each variant can carry associated data.

Syntax:

```tuff
type MyUnion = Variant1<Data1> | Variant2<Data2> | Variant3;
```

The standard library defines `Option<T>` and `Result<T, E>` as unions:

```tuff
type Option<T> = Some<T> | None;
type Result<T, E> = Ok<T> | Err<E>;
```

#### Creating union values

To create a value of a union type, use the variant name with its associated data:

```tuff
let maybe_value: Option<I32> = Some(42);
let nothing: Option<String> = None;

let success: Result<I32, String> = Ok(100);
let failure: Result<I32, String> = Err("something went wrong");
```

#### Defining custom unions

You can define your own union types for domain-specific problems:

```tuff
type Status = Running | Paused | Stopped;
type Response<T> = Success<T> | Failure<String> | Timeout;

let status: Status = Running;
let resp: Response<I32> = Success(42);
```

#### Accessing union data

Union values can be destructured and accessed using pattern matching (see the Pattern Matching section), or you can check the variant and unwrap the value:

```tuff
fn print_option(opt: Option<I32>) => {
    // Pattern matching approach (described in Pattern Matching section):
    // match opt {
    //     Some(x) => io.print(x),
    //     None => io.print("nothing")
    // }
}
```

Union types provide a type-safe way to represent values that can be one of several states, with compile-time guarantees that all variants are handled correctly.

### Destructuring

Destructuring allows you to unpack values from composite types (structs, tuples, unions) into individual variables in a single declaration.

#### Destructuring structs

You can extract struct fields into separate variables using brace syntax:

```tuff
struct Point {
    x: I32,
    y: I32
}

let p = Point { 10, 20 };
let { x, y } = p;  // unpack fields into x and y

io.print(x);  // 10
io.print(y);  // 20
```

You can also destructure with type annotations:

```tuff
let { x: I32, y: I32 } = p;
```

Destructuring also works with `let mut`:

```tuff
let mut { x, y } = p;
x = 30;  // x is now mutable
```

#### Destructuring tuples

Tuples can be destructured using parentheses or brace syntax:

```tuff
let pair: (I32, String) = (42, "hello");

// Using parentheses
let (num, str) = pair;
io.print(num);   // 42
io.print(str);   // "hello"

// Or with type annotations
let (n: I32, s: String) = pair;
```

#### Destructuring unions

When you've used `is` to narrow a union type, you can destructure to access inner values:

```tuff
let maybe_value: Option<I32> = Some(100);

if (maybe_value is Some) {
    let { value } = maybe_value;  // extract the inner value
    io.print(value);  // 100
}

let result: Result<String, I32> = Ok("success");
if (result is Ok) {
    let { value } = result;
    io.print(value);  // "success"
}
```

#### Nested destructuring

You can destructure nested structures:

```tuff
struct Rectangle {
    top_left: Point,
    bottom_right: Point
}

let rect = Rectangle { Point { 0, 0 }, Point { 100, 100 } };
let { top_left: { x: x1, y: y1 }, bottom_right: { x: x2, y: y2 } } = rect;

io.print(x1);  // 0
io.print(y2);  // 100
```

Destructuring provides a concise way to work with composite values, reducing boilerplate and improving code readability.

## Functions

Functions are first-class values in Tuff. They can be declared at the top level with a name, passed as expressions, or defined inline as lambdas. Function return types are specified with `: Type` and the body follows `=>`. The function body is an expression. Return types may be omitted and inferred by the compiler from the function body when possible.

The `yield` keyword is used to produce a value from a block or function: `yield expr;` immediately exits the current function and yields `expr` as the final result. `yield;` without a value can be used to return early from a function that returns `Void`.

If a function's return type is omitted, the compiler infers the return type from the set of expressions used in `yield` statements within the function as well as the final expression (if present). If different `yield` expressions or the final expression are present and their types conflict, the compiler rejects the function as a type error.

#### Named function declarations

Top-level functions are declared with `fn`:

Syntax:

```tuff
fn name(param: Type, ...) : ReturnType => { expression }
// or, when the body is a single expression, braces may be omitted
fn name(param: Type, ...) : ReturnType => expression
// or omit the return type and have it be inferred by the compiler
fn name(param: Type, ...) => expression
```

Examples:

```tuff
// implicit return type inferred as I32
fn add(a: I32, b: I32) => { a + b }

// explicit return type and early yield
fn sign(x: I32) : I32 => {
    if (x == 0) { yield 0; }
    if (x > 0) { yield 1; }
    -1
}

// Simple arithmetic function using expression body
fn add(first : I32, second : I32) : I32 => { first + second }

// Example of early yield from a void function
fn print_nonzero(x: I32) => {
    if (x == 0) { yield; } // yields Void
    io.print(x);
}

fn greet(name: String) : String => { "Hello, " + name }

fn main() {
    let msg = greet("world")
    io.print(msg + "\n")
}
```

#### Functions as first-class values

Functions are values and can be passed as arguments, assigned to variables, or used as expressions. A function type is written as `(ParamType, ...) => ReturnType`.

Functions and local variables share the same namespace — you cannot declare both a function and a variable with the same name in the same scope.

Examples:

```tuff
// Passing a named function as an expression
fn apply(f: (I32, I32) => I32, a: I32, b: I32) : I32 => {
    f(a, b)
}

fn multiply(x: I32, y: I32) : I32 => { x * y }

// Pass the named function as a value
let result = apply(fn multiply(x: I32, y: I32) => { x * y }, 3, 4);
// or equivalently, use the function name directly:
let result = apply(multiply, 3, 4);
```

#### Lambda functions (anonymous functions)

You can define functions inline by omitting the function name, using the lambda syntax `(param: Type, ...) => expression`:

```tuff
// Lambda assigned to a variable
let add : (I32, I32) => I32 = (a: I32, b: I32) => { a + b };

// Lambda passed directly as an argument
fn apply(f: (I32, I32) => I32, a: I32, b: I32) : I32 => { f(a, b) }
let result = apply((x: I32, y: I32) => { x * y }, 5, 6);

// Lambda with inferred return type
let double : (I32) => I32 = (x) => { x * 2 };
```

#### Capturing variables (closures)

Lambdas can capture variables from their enclosing scope. The capture semantics follow borrowing rules (described in the ownership and lifetime sections).

```tuff
let factor: I32 = 10;
let multiply_by_factor : (I32) => I32 = (x) => { x * factor };
let result = multiply_by_factor(5); // result is 50
```

Note: `fn main()` by convention returns unit; return type is optional and may be inferred.

#### Class declarations (constructor functions)

The `class` keyword is syntactic sugar for a function that automatically yields `this`. It simplifies the common pattern of constructor functions that capture parameters as scope fields.

Syntax:

```tuff
class fn Name(param: Type, ...) => { /* body */ }
```

This is equivalent to:

```tuff
fn Name(param: Type, ...) => { /* body */ yield this; }
```

The `class fn` syntax is useful for creating constructor-like functions that produce a value containing all the parameters and any derived fields computed in the body:

```tuff
class fn Point(x: I32, y: I32) => {}

let p = Point(5, 10);
io.print(p.x);  // 5
io.print(p.y);  // 10
```

You can also compute additional fields before the implicit `yield this`:

```tuff
class fn Rectangle(width: I32, height: I32) => {
    let area: I32 = width * height;
    let perimeter: I32 = 2 * (width + height);
}

let r = Rectangle(10, 5);
io.print(r.width);      // 10
io.print(r.height);     // 5
io.print(r.area);       // 50
io.print(r.perimeter);  // 30
```

You can also add logic before the implicit yield:

```tuff
class fn User(name: String, age: I32) => {
    if (age < 0) {
        yield; // early exit, yields Void (validation failure)
    }
    // implicit yield this at the end
}
```

#### Methods (inner functions in classes)

Methods are functions defined within the body of a class. They have access to all bindings in the class scope (parameters and locally-defined values) and are included as fields in the yielded `this` value.

Syntax:

```tuff
class fn Point(x: I32, y: I32) => {
    fn manhattan() => x + y;
    fn distance_from_origin() => {
        let sum_of_squares: I32 = x * x + y * y;
        sum_of_squares  // would need sqrt for actual distance
    }
}
```

Methods are invoked using dot notation:

```tuff
let p = Point(3, 4);
let manhattan_dist = p.manhattan();  // 7
let sum_sq = p.distance_from_origin();  // 25
```

Methods capture variables from their enclosing class scope, functioning as closures:

```tuff
class fn Counter(initial: I32) => {
    let mut count: I32 = initial;
    fn increment() => {
        count = count + 1;
    }
    fn get_count() => count;
}

let c = Counter(0);
c.increment();
io.print(c.get_count());  // 1
```

#### Classes and functions as expressions

Since all classes are functions and all functions are expressions, you can assign classes to variables and pass them around:

```tuff
let MyPoint = class fn Point(x: I32, y: I32) => {
    fn manhattan() => x + y;
};

let p = MyPoint(5, 12);
io.print(p.manhattan());  // 17
```

The type of `MyPoint` is a function type `(I32, I32) => Type`. You can also assign unnamed class constructors:

```tuff
let make_point : (I32, I32) => Type = class fn(x: I32, y: I32) => {};

let origin = make_point(0, 0);
io.print(origin.x);  // 0
```

This unification of classes and functions as first-class expressions provides tremendous flexibility for functional and object-oriented programming styles.

#### The `this` keyword

The `this` keyword is a special value that captures all bindings in the current lexical scope. It behaves like an object whose fields are the variables and functions accessible in that scope.

**Accessing scope members via `this`:**

You can access any variable or function in the current scope using `this`:

```tuff
let x: I32 = 100;
let y: I32 = 200;
let scope_snapshot = this;
io.print(scope_snapshot.x);  // 100
io.print(scope_snapshot.y);  // 200
```

The `this` value is immutable by default and provides read access to the scope. If you modify a variable through `this`, the change is reflected in the original scope (when applicable).

**`this` in functions:**

Inside a function, `this` includes all parameters as fields. This makes functions particularly powerful — they can naturally act as constructors:

```tuff
fn Point(x: I32, y: I32) => {
    this  // yields the scope containing x and y as fields
}

let p = Point(3, 4);  // p has fields x: I32 and y: I32
io.print(p.x);        // 3
io.print(p.y);        // 4
```

The `class` keyword provides syntactic sugar for this pattern:

```tuff
class fn Point(x: I32, y: I32) => {}  // equivalent to: fn Point(x: I32, y: I32) => this;

let p = Point(3, 4);
io.print(p.x);  // 3
io.print(p.y);  // 4
```

You can also compute derived values before yielding:

```tuff
fn Rectangle(width: I32, height: I32) => {
    let area: I32 = width * height;
    this  // yields scope with width, height, and area
}

let rect = Rectangle(10, 5);
io.print(rect.width);   // 10
io.print(rect.height);  // 5
io.print(rect.area);    // 50
```

**Scope composition with `this`:**

When you yield `this` from a block or function, you create a snapshot of that scope's bindings. This is useful for creating data structures on-the-fly without explicit struct declarations.

```tuff
let user = {
    let id: I32 = 1;
    let name: String = "Bob";
    let email: String = "bob@example.com";
    this  // creates a value with fields id, name, email
};

io.print(user.name);  // "Bob"
```

## Generics and Type Parameters

Structs and functions can be parameterized over types using generic type parameters. Type parameters are specified in angle brackets `< >` following the name.

#### Generic structs

```tuff
struct Pair<T, U> {
    first : T,
    second : U
}
```

Instantiate a generic struct by providing concrete types:

```tuff
let p : Pair<I32, String> = Pair { 42, "hello" };
io.print(p.first);   // 42
io.print(p.second);  // "hello"

let q : Pair<Bool, F32> = Pair { true, 3.14 };
```

#### Generic functions

Functions can also be generic over type parameters:

```tuff
fn first<T, U>(pair: Pair<T, U>) : T => {
    pair.first
}

fn swap<T, U>(pair: Pair<T, U>) : Pair<U, T> => {
    Pair { pair.second, pair.first }
}
```

Type parameters in function signatures work in both the parameter list and the return type. The compiler infers type arguments from the actual arguments passed, or they can be specified explicitly (when needed for disambiguation).

When assigning a generic function to a local variable, you must specify the type parameters explicitly. You cannot assign an unspecialized generic function to a variable:

```tuff
fn pass<T>(value: T) : T => value;

// Invalid: cannot assign generic function without type parameters
// let myFunc = pass;  // Error: type parameters must be specified

// Valid: specify type parameters
let myFunc : (I32) => I32 = pass<I32>;
let result = myFunc(42);  // 42

// Can also specialize different generic functions
let str_func : (String) => String = pass<String>;
let greeting = str_func("hello");  // "hello"
```

This constraint ensures that assigned functions have fully-specified types, maintaining type safety and clarity.

#### Generic classes

Classes can also be generic:

```tuff
class fn Container<T>(value: T) => {
    fn get() => value;
}

let int_container = Container<I32>(100);
let result = int_container.get();  // 100

let str_container = Container<String>("Tuff");
let text = str_container.get();  // "Tuff"
```

Type parameters flow naturally through the generic class definition, and the yielded `this` value includes all the type information.

## Control Flow

Standard statements: `if`, `else`, `while`, `loop`, and pattern matching with `match`.

Note: Tuff deliberately does not include a C-style `for` statement. For iteration, prefer iterator-based solutions (see the "Iteration and iterators" section).

#### If statements and expressions

If statements require parentheses around the condition — `if (cond) { ... }`. Braces are optional when the branch is a single statement and can be omitted (C-like compact form): `if (cond) doSomething();`.

If expressions are supported — an `if` can be used where a value is required (e.g., an initializer). When used as an expression, every branch must return a value (either a simple expression or a block expression whose final statement is a value). An `else` branch is required for `if` expressions so that there is always a value returned. You may chain with `else if`.

Examples:

```tuff
// As statements
if (x > 0) {
    io.print("positive")
}

if (x == 0) io.print("zero");

// As expressions (values must be provided in all branches)
let value = if (x < 0) -x else x; // Ok: branches are numeric values
let value = if (a == 1) { let v = 42; v } else { 0 }; // Ok: block expressions as branches returns values

// Chained conditional expression
let value = if (cond1) 100 else if (cond2) 200 else 300;

// Invalid: missing else in an expression context
// let v = if (cond) 1; // Error: 'if' expression requires `else` branch to produce a value
```

Type rules: every branch of an `if` expression must produce the same (or compatible) type; otherwise it's a compile-time error.

#### While statements

`while` follows the usual C-style semantics with parentheses around the condition: `while (cond) { ... }`. Braces may be omitted for single-statement bodies. Unlike `if`, `while` is purely a statement — it does not produce a value and therefore cannot be used as an expression in an initializer or other value contexts. Consequently, `else` branches do not conceptually apply to `while`.

Examples:

```tuff
let mut i: I32 = 0;
while (i < 5) {
    io.print(i);
    i = i + 1;
}

// Single-statement without braces
while (ready) check_status();

// Invalid: while cannot be used as an expression or initializer
// let v = while (cond) { 1 }; // Error: `while` is a statement, not an expression
```

`break` and `continue` control loop flow as expected: `break` exits the nearest loop, `continue` skips to the next iteration.

#### `loop` (infinite loop / expression loop)

The `loop` keyword starts an infinite loop; it does not take parentheses: `loop { ... }`.

- A bare `loop { ... }` is a statement that executes indefinitely until a `break` is encountered.
- `break` may be used without a value to exit the loop. `break` can also yield a value when used inside a `loop` expression, e.g., `break 5;`. Using `break` with a value in a non-expression loop (e.g., `while`) is a compile-time error.
- `loop` can be used as an expression if and only if the loop contains a `break` with a value along all code paths that reach the statement. In expression use, the loop evaluates to the value passed to `break`.
- `continue` skips to the next iteration as usual.

Examples:

```tuff
loop { io.print("forever"); break; } // breaks without returning a value

let value = loop { break 5; }; // `value` is 5

let mut i = 0;
let v = loop {
    i = i + 1;
    if (i == 3) break i; // `v` becomes 3
}

// Invalid: a loop used as an expression must return a value via `break`.
// let x = loop { /* no break with value */ }; // Error: loop expression does not produce a value
```

````tuff
let mut i: I32 = 0;
while (i < 5) {
    io.print(i);
    i = i + 1;
}

// Or, using iterator-based approaches (preferred):
// std::iter::range(0, 5).for_each(|i| io.print(i));
// or using a collection's iterator:
// std::iter::from_slice([0,1,2,3,4]).for_each(|i| io.print(i));
```

#### Type checking with `is`

The `is` keyword allows you to check if a value is of a specific type (especially useful with union types). When used in an `if` condition, the type is narrowed within that block, allowing you to safely access the inner value.

Syntax:

```tuff
if (value is TypeVariant) {
    // Inside this block, 'value' is known to be of type TypeVariant
    // and you can access its fields
}
```

Examples with `Option<T>`:

```tuff
let maybe_number: Option<I32> = Some(42);

if (maybe_number is Some) {
    let num = maybe_number.value;  // safely access the inner I32
    io.print(num);
}

let nothing: Option<String> = None;
if (nothing is Some) {
    // This block doesn't execute because nothing is None
}

if (nothing is None) {
    io.print("No value present");
}
```

Examples with `Result<T, E>`:

```tuff
let result: Result<I32, String> = Ok(100);

if (result is Ok) {
    let value = result.value;  // access the success value
    io.print(value);
}

if (result is Err) {
    let error = result.error;  // access the error message
    io.print(error);
}
```

Examples with custom union types:

```tuff
type Status = Running | Paused | Stopped;

let current_status: Status = Running;

if (current_status is Running) {
    io.print("Process is running");
}

if (current_status is Paused) {
    io.print("Process is paused");
}
```

The `is` keyword provides type-safe discrimination of union variants without requiring full pattern matching syntax, making common cases concise and readable.

#### Match expressions

For more complex pattern matching, Tuff supports `match` expressions (similar to Rust). A `match` expression evaluates a value against multiple patterns and executes the corresponding branch.

Syntax:

```tuff
match (value) {
    Pattern1 => expression1,
    Pattern2 => expression2,
    _ => default_expression
}
```

The `_` pattern is a wildcard that matches any value and serves as the default case.

Examples with `Option<T>`:

```tuff
let maybe_value: Option<I32> = Some(42);

let message = match (maybe_value) {
    Some => "We have a value",
    None => "No value present"
};

// With wildcard default
let result = match (maybe_value) {
    Some => maybe_value.value + 1,
    _ => 0
};
```

Examples with `Result<T, E>`:

```tuff
let result: Result<I32, String> = Ok(100);

let outcome = match (result) {
    Ok => "Success",
    Err => "Failed"
};

// Processing the value in each branch
let value = match (result) {
    Ok => result.value * 2,
    Err => -1
};
```

Examples with custom union types:

```tuff
type Status = Running | Paused | Stopped;

let status: Status = Running;

let description = match (status) {
    Running => "Process is executing",
    Paused => "Process is paused",
    Stopped => "Process has finished"
};

// Using wildcard for multiple cases
let is_active = match (status) {
    Running => true,
    _ => false  // Paused and Stopped both return false
};
```

Examples with pattern destructuring:

```tuff
type Response<T> = Success<T> | Failure<String>;

let resp: Response<I32> = Success(42);

let final_value = match (resp) {
    Success => {
        let { value } = resp;
        value + 10
    },
    Failure => {
        let { value } = resp;
        io.print(value);  // print error message
        0
    }
};
```

Match expressions can also be used as statements:

```tuff
match (user_input) {
    "quit" => {
        io.print("Exiting...");
        yield;
    },
    "help" => io.print("Available commands: quit, help"),
    _ => io.print("Unknown command")
}
```

The `match` expression is powerful for handling multiple variants of union types with exhaustiveness checking and pattern matching.

## Operators

Tuff provides a comprehensive set of operators for comparisons, arithmetic, logic, bitwise operations, and assignments.

#### Comparison operators

Tuff supports the usual comparison operators which return a `Bool`:

- `==` equality
- `!=` inequality
- `<` less than
- `<=` less than or equal
- `>` greater than
- `>=` greater than or equal

Comparisons operate on comparable types (numeric types with compatible widths and signedness, `Char`, and `String`); attempting to compare unrelated types is a compile-time error. For numeric comparisons, the compiler will attempt to infer a common type for the operands when possible (e.g., when a literal is present). Otherwise, explicit casts are required.

Examples:

```tuff
if 10U8 + 100U8 == 110U8 { io.print("ok") }
if a < b { io.print("a smaller than b") }
if s1 == s2 { io.print("equal") }
if c != 'a' { io.print("not a") }
```

#### Arithmetic operators

Tuff supports standard arithmetic operations:

- `+` addition
- `-` subtraction
- `*` multiplication
- `/` division (integer division for integer types, floating-point for float types)
- `%` modulo (remainder after division)

Examples:

```tuff
let a: I32 = 10;
let b: I32 = 3;
let sum = a + b;        // 13
let diff = a - b;       // 7
let product = a * b;    // 30
let quotient = a / b;   // 3 (integer division)
let remainder = a % b;  // 1

let x: F32 = 10.0;
let y: F32 = 3.0;
let f_quotient = x / y; // 3.333... (floating-point division)
```

Arithmetic operations follow standard precedence: `*`, `/`, `%` bind tighter than `+` and `-`. Parentheses can be used to override precedence.

### Logical operators

Tuff supports logical operations for `Bool` types:

- `&&` logical AND (short-circuit evaluation)
- `||` logical OR (short-circuit evaluation)
- `!` logical NOT

Short-circuit evaluation means that:
- In `a && b`, if `a` is false, `b` is never evaluated
- In `a || b`, if `a` is true, `b` is never evaluated

Examples:

```tuff
let a: Bool = true;
let b: Bool = false;

let and_result = a && b;  // false
let or_result = a || b;   // true
let not_result = !a;      // false

// Short-circuit example: b_func is not called if a is false
if (a && b_func()) { /* ... */ }
```

#### Bitwise operators

For integer types, Tuff provides bitwise operations:

- `&` bitwise AND
- `|` bitwise OR
- `^` bitwise XOR
- `~` bitwise NOT
- `<<` left shift
- `>>` right shift

Examples:

```tuff
let a: U8 = 0b1100;  // 12
let b: U8 = 0b1010;  // 10

let and = a & b;    // 0b1000 (8)
let or = a | b;     // 0b1110 (14)
let xor = a ^ b;    // 0b0110 (6)
let not = ~a;       // 0b0011 (3, for U8)

let left = a << 1;  // 0b11000 (24)
let right = a >> 1; // 0b0110 (6)
```

#### Assignment and compound assignment operators

Variables can be reassigned (if declared `mut`) using the assignment operator `=`. Compound assignment operators combine an arithmetic operation with assignment:

- `=` assignment
- `+=` add and assign
- `-=` subtract and assign
- `*=` multiply and assign
- `/=` divide and assign
- `%=` modulo and assign
- `&=` bitwise AND and assign
- `|=` bitwise OR and assign
- `^=` bitwise XOR and assign
- `<<=` left shift and assign
- `>>=` right shift and assign

Examples:

```tuff
let mut x: I32 = 10;
x = 20;           // x is now 20
x += 5;           // x is now 25
x -= 3;           // x is now 22
x *= 2;           // x is now 44
x /= 4;           // x is now 11
x %= 5;           // x is now 1

let mut flags: U8 = 0b1010;
flags |= 0b0101;  // flags is now 0b1111
flags &= 0b1100;  // flags is now 0b1100
```

## Iteration and Iterators

Tuff favors iterator-based iteration patterns instead of a C-style `for` statement. The standard library exposes iterator helpers (e.g., `iter()`, `range()`, and collection-specific iterator adapters) that can be composed and applied using methods such as `for_each`, `map`, and `filter`.

Iterator utilities are part of `std` and are preferred for clarity and composability. Basic examples (library API is illustrative):

```tuff
let arr = [1, 2, 3];
// using an iterator adapter and a closure
std::iter::from_slice(arr).for_each(|v| io.print(v));

// generate a range iterator
std::iter::range(0, 5).for_each(|i| io.print(i));

// or manually pulling values from an iterator
let mut it = arr.iter();
while (it.has_next()) {
    let v = it.next().unwrap();
    io.print(v);
}
```

Note: exact iterator APIs and closure syntax are implemented in the standard library and may be refined as the language and standard library evolve.

## Modules and Imports

Modules are a way to organize code into logical namespaces. Modules can be defined within a file, and their members are accessed using the `::` scope resolution operator.

### Defining modules

A module is declared with the `module` keyword followed by a name and a block containing declarations:

```tuff
module Math {
    let pi: F32 = 3.14159;

    fn add(a: I32, b: I32) : I32 => { a + b }
    fn multiply(a: I32, b: I32) : I32 => { a * b }
}

let result = Math::add(5, 3);      // 8
let pi_value = Math::pi;           // 3.14159
```

Modules can be nested:

```tuff
module Utils {
    module String {
        fn length(s: String) : I32 => {
            // implementation
        }
    }
}

let len = Utils::String::length("hello");
```

### Visibility and module access

All members of a module are accessible via the `::` operator. Modules provide namespacing and encapsulation, allowing you to organize code without polluting the global scope.

```tuff
module Graphics {
    class fn Color(r: U8, g: U8, b: U8) => {}
    class fn Point(x: I32, y: I32) => {}
}

let red = Graphics::Color(255, 0, 0);
let origin = Graphics::Point(0, 0);
```

### Importing modules

Modules from other files can be imported using the `import` keyword. The imported module name becomes available in the current scope:

```tuff
// In math.tuff
module Math {
    fn add(a: I32, b: I32) : I32 => { a + b }
}

// In main.tuff
import math

fn main() {
    let result = math::add(1, 2);
    io.print(result);
}
```

### File-based modules (implicit modules)

Every file in your project implicitly becomes a module based on its path relative to the project root. The file path is converted to a module path using `::` as the separator.

For example:
- File `./com/example.tuff` becomes the module `com::example`
- File `./utils/string/helpers.tuff` becomes the module `utils::string::helpers`

Top-level declarations in a file are members of that file's implicit module. You can import and use these declarations:

```tuff
// In ./com/example.tuff
let value: I32 = 100;

fn compute(x: I32) : I32 => { x * 2 }
```

To use these declarations from another file:

```tuff
// In main.tuff
from com::example use { value, compute };

fn main() {
    io.print(value);         // 100
    io.print(compute(50));   // 100
}
```

You can also access them directly via the module path:

```tuff
// In main.tuff
fn main() {
    io.print(com::example::value);
    io.print(com::example::compute(50));
}
```

This implicit module system eliminates boilerplate and naturally maps your project's file structure to its module hierarchy.

## Foreign Function Interface (FFI)

Tuff provides the `extern` keyword for interfacing with external code from other languages and runtimes. This enables interoperability with existing ecosystems while maintaining type safety at the boundary.

### External types

Use `extern type` to declare types defined in foreign code:

```tuff
extern type MyType;
extern type FileHandle;
extern type Promise<T>;
```

External types are opaque to Tuff — their internal structure is unknown, but you can pass them around and use them with external functions.

Note: Tuff does not support `extern struct`. If you need to reference a foreign struct-like type, use `extern type`. However, you can define a local struct and use it with external functions:

```tuff
struct Point {
    x: I32,
    y: I32
}

extern fn draw_point(p: Point) : Void;
```

### External variables

Declare external variables (constants or mutable values from foreign code):

```tuff
extern let PI : F32;
extern let mut globalCounter : I32;
```

These declarations reference values defined externally. You can read from them (and write to mutable ones) as if they were local variables.

### External functions

Declare functions implemented in foreign code:

```tuff
extern fn doSomething() : Void;
extern fn compute(x: I32, y: I32) : I32;
extern fn readFile(path: String) : Promise<String>;
```

`Void` is a built-in type representing "no value". It's used as the return type for functions that don't produce a meaningful value.

External functions can use both external types and Tuff-defined types:

```tuff
struct Config {
    timeout: I32,
    retries: I32
}

extern fn initialize(config: Config) : Void;
extern fn getHandle() : FileHandle;
```

### External classes

You can declare external class constructors:

```tuff
extern class fn Buffer(size: I32) => {
    fn read() : String;
    fn write(data: String) : Void;
}

let buf = Buffer(1024);
buf.write("hello");
```

External classes follow the same syntax as regular classes but are implemented externally. The method signatures define the expected interface.

### External module imports

Import declarations from external modules using `extern from`:

```tuff
// Import from Java standard library
extern from java::util use { List, Map, Set };

// Import from Node.js modules
extern from fs::promises use { access, readFile, writeFile };

// Import from custom external modules
extern from native::graphics use { createWindow, drawRect };
```

External imports allow seamless integration with foreign module systems. The module path syntax follows the same `::` convention as Tuff modules.

### Type safety with FFI

Tuff enforces type checking at FFI boundaries. Type mismatches between Tuff code and external declarations will be caught at compile time where possible. Runtime conversions and marshalling are handled automatically for supported types.

Primitive types map naturally to most foreign runtimes:
- `I32`, `U32`, etc. map to integer types
- `F32`, `F64` map to floating-point types
- `Bool` maps to boolean
- `String` maps to string types
- `Void` is used for functions that return nothing

Complex types (structs, classes, unions) can be passed across FFI boundaries. The compiler generates appropriate marshalling code based on the target runtime.

### Example: Complete FFI usage

```tuff
// External types and functions
extern from node::fs use { FileHandle };
extern from node::path use { join };

extern fn open(path: String) : FileHandle;
extern fn close(handle: FileHandle) : Void;

// Local struct with external function
struct ReadOptions {
    encoding: String,
    bufferSize: I32
}

extern fn readWithOptions(handle: FileHandle, opts: ReadOptions) : String;

// Usage
fn processFile(filename: String) => {
    let fullPath = join("/data", filename);
    let handle = open(fullPath);

    let opts = ReadOptions { "utf8", 4096 };
    let content = readWithOptions(handle, opts);

    close(handle);
    content
}
```

The FFI system is designed to be explicit and safe, making foreign code integration straightforward while maintaining Tuff's type safety guarantees.

## Error Handling

Tuff provides `Result<T, E>` and `Option<T>` types for error handling and optional values.

### Result type

`Result<T, E>` represents a value that can be either a success (`Ok(T)`) or an error (`Err(E)`):

```tuff
fn divide(a: F32, b: F32) : Result<F32, String> => {
    if (b == 0.0) {
        Err("division by zero")
    } else {
        Ok(a / b)
    }
}

let result = divide(10.0, 2.0);
// result is Ok(5.0)

let error_result = divide(10.0, 0.0);
// error_result is Err("division by zero")
```

### Option type

`Option<T>` represents a value that may or may not exist — either `Some(T)` or `None`:

```tuff
fn find_first<T>(arr: *[T]) : Option<T> => {
    if (arr.length > 0) {
        Some(arr[0])
    } else {
        None
    }
}

let value = find_first([1, 2, 3]);
// value is Some(1)

let empty = find_first([]);
// empty is None
```

Both types encourage explicit handling of error and edge cases, making code more robust and easier to reason about.

## Tooling

Common tools for a programming language project:

- `tuffc`: Compiler for Tuff source files
- `tuff`: REPL and runner
- `tuftest`: Test runner (placeholder)
- `cargo-tuff` or similar package manager (optional)

Example workflow:

```sh
tuffc -o hello hello.tuff
./hello
tuff test # run tests
```

## Examples

Hello world (example included above) and a simple program to read from stdin:

```tuff
import std.io

fn main() {
    io.print("Enter your name: ")
    let name = io.read_line()
    io.print("Hello, " + name + "\n")
}
```

## Contributing

If you want to contribute to Tuff:

1. Fork the repo.
2. Create feature/bug branches.
3. Add tests for new features or bug fixes.
4. Run the test suite and ensure it passes.
5. Submit a pull request with a clear description and any relevant benchmarks or performance notes.

## Roadmap

- Core language specification and parser
- Stable standard library APIs
- Optimizing compiler backend
- Package manager and ecosystem tooling
- Official documentation and tutorials

## License

Specify your project's license here (e.g., MIT, Apache-2.0).

## Notes & TODOs

- Flesh out the concrete syntax and semantics sections.
- Add comprehensive standard library documentation.
- Add precise build/testing/benchmarking instructions.
````
