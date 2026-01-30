# Tuff Language Tutorial

Tuff is a small Rust-ish DSL with both an interpreter and compiler implemented in `src/index.ts`. The language behavior is rigorously defined by the Jest test suite in `tests/*.test.ts`.

## Running Tuff code

- `pnpm start` runs `bun ./src/index.ts`, which loads `src/index.tuff` and prints the result of `interpret(...)`.
- `pnpm dev` watches `src/**/*.ts` and `*.tuff` and re-runs on changes.

Tuff programs evaluate to a single numeric result:

- The value of the final expression is the program result.
- If the program ends in a statement with a trailing `;`, the result is `0`.
- Empty input evaluates to `0`.

## Comments

- Line comments: `// ...` (until newline)
- Block comments: `/* ... */` (can contain braces)
- Comment markers inside strings are not treated as comments.

Example:

```tuff
let x = 1; // ignored
/* { comment with braces } */
x + 2
```

## Statements and blocks

- Statements are separated by semicolons: `...;`.
- Braces `{ ... }` create a block expression.
  - Variables declared in a block do not leak out.
  - Mutations to _outer_ variables are merged back out.
  - Blocks ending with a statement (followed by `;`) evaluate to `0`.
  - Blocks ending with an expression evaluate to that expression's value.

Example:

```tuff
let mut x = 0;
{ x = 1; }  // Block evaluates to 0 (ends with statement)
x           // Result is 1 (x was mutated)
```

## Literals and primitive types

### Numbers

- Plain numeric literals are treated as `I32` for type validation.
- Numeric suffixes are **case-sensitive** and determine the type:
  - Unsigned: `U8`, `U16`, `U32`, `U64`, `USize`
  - Signed: `I8`, `I16`, `I32`, `I64`

Examples:

```tuff
100        // I32
100U8      // U8
-128I8     // I8
100USize   // USize
```

Sharp edges:

- Lowercase suffixes are rejected: `100u8` → error `invalid suffix`.
- Range is strictly checked: `256U8` errors (max is `255U8`).
- Signed bounds: `I8` is `-128` to `127`, `I16` is `-32768` to `32767`, etc.
- Negative values with unsigned suffixes error: `-100U8` is invalid.

### Bool

- `true` / `false`
- Internally stored as `1` / `0` but treated as a distinct type.
- Arithmetic operations on booleans are rejected.
- Logical operators work on booleans: `&&` (AND), `||` (OR).

Examples:

```tuff
true || false   // Evaluates to 1 (true)
true && false   // Evaluates to 0 (false)
true + false    // Error: arithmetic on Bool is invalid
```

### Char

- Char literals use single quotes: `'a'`, `'Z'`, `'0'`.
- Evaluates to the UTF-16 code unit number.
- Type is `Char`.

Example:

```tuff
let x : Char = 'a';  // Evaluates to 97
```

### Str

- String literals use double quotes: `"hello"`.
- Strings are accessed through pointer types (`*Str`).
- Support indexing to get individual characters: `str[index]` returns `Char`.
- Support `.length` property to get string length.

Examples:

```tuff
let x : *Str = "test";
x[0]        // Evaluates to 116 (UTF-16 code for 't')
x.length    // Evaluates to 4
```

## Variables

### Declaration

- `let name = expr;`
- `let name : Type = expr;`
- `let mut name = expr;` (mutable)
- `let name : Type;` (uninitialized, requires later assignment)

Uninitialized variables:

```tuff
let mut x : U8;
x = 100;
x  // Result is 100
```

Important rules:

- Variables cannot be re-declared in the same scope.
- Uninitialized immutable variables can be assigned once, but not reassigned.
- Type must be specified when declaring without initializer.

### Assignment

- Only `mut` variables can be reassigned.
- First assignment to an uninitialized variable is allowed even for immutable variables.
- Compound assignments exist: `+=`, `-=`, `*=`, `/=`.
- Compound assignments require numeric types (no booleans).

Example:

```tuff
let mut x = 10;
x += 1;     // x is now 11
x           // Result is 11
```

Errors:

```tuff
let x = 10;
x = 20;      // Error: cannot reassign immutable variable

let mut y = true;
y += 1;      // Error: compound assignment on boolean
```

### Type constraints

A declaration can constrain numeric values:

```tuff
let x : I32 < 10 = 5;   // OK: 5 < 10
let y : I32 < 10 = 20;  // Error: constraint violated
```

## Type system and conversions

### Type widening and narrowing

- Widening conversions (e.g., `U8` → `U16`) are allowed.
- Narrowing conversions (e.g., `U16` → `U8`) are rejected.
- Plain numeric literals have type `I32` and require explicit widening or matching type.

Examples:

```tuff
let x : U16 = 100U8;     // OK: U8 widens to U16
let y : U8 = 100U16;     // Error: U16 doesn't narrow to U8
let z = 100;             // z has type I32
let a : I32 = z;         // OK: matching types
let b : U8 = z;          // Error: I32 doesn't narrow to U8
```

### The `is` operator

The `is` operator checks if a value matches a type:

```tuff
let x = 100;
x is I32     // Evaluates to 1 (true)
x is Bool    // Evaluates to 0 (false)
```

## Operators and expressions

### Arithmetic operators

- Addition: `+`
- Subtraction: `-`
- Multiplication: `*`
- Division: `/`

Overflow checking:

- Operations check for overflow based on the widest operand type.
- Division by zero is an error.

Example:

```tuff
1U8 + 254     // Error: overflows U8 (result would be 255, but 254 is I32)
1U8 + 254U8   // OK: result is 255U8
10 / 0        // Error: division by zero
```

### Comparison operators

All comparison operators return `Bool`:

- `<` (less than)
- `<=` (less than or equal)
- `>` (greater than)
- `>=` (greater than or equal)
- `==` (equal)
- `!=` (not equal)

Examples:

```tuff
1 < 2         // Evaluates to 1 (true)
1 != 1        // Evaluates to 0 (false)
100 == true   // Error: type mismatch
```

### Logical operators

- `&&` (logical AND)
- `||` (logical OR)

Both require `Bool` operands and return `Bool`.

### Operator precedence

From highest to lowest:

1. Dereference `*`, reference `&`, unary `-`
2. Multiplication `*`, division `/`
3. Addition `+`, subtraction `-`
4. Comparisons `<`, `<=`, `>`, `>=`, `==`, `!=`
5. Logical AND `&&`
6. Logical OR `||`

Parentheses `()` or braces `{}` override precedence:

```tuff
2 * 3 - 4       // Evaluates to 2
(4 + 2) * 3     // Evaluates to 18
4 + { 2 } * 3   // Evaluates to 10 (braces act as grouping)
```

## Control flow

### If expressions

`if` is an expression and requires an `else` branch:

```tuff
if (true) 2 else 3    // Evaluates to 2
```

Rules:

- Condition must be `Bool`.
- Both branches must have compatible types.
- Branches can widen to match: `if (true) 5U16 else 5U8` widens to `U16`.
- Narrowing is rejected: `let x : U8 = if (true) 5U16 else 5U8;` errors.

Chained if-else:

```tuff
if (false) 2 else if (false) 3 else 4   // Evaluates to 4
```

### While loops

`while` always evaluates to `0`:

```tuff
let mut x = 0;
while (x < 4) { x += 1; }
x    // Result is 4 (loop modified x)
```

Rules:

- Condition must be `Bool`.
- Braces are optional for single statements.

## Functions

### Basic functions

Define a function:

```tuff
fn add(first : I32, second : I32) => first + second;
add(3, 4)    // Evaluates to 7
```

Key points:

- Function definitions evaluate to `0`.
- Return types are optional; Tuff infers from the body if omitted.
- `Void` functions exist: `fn empty() : Void => {};`.
- `Void` function calls evaluate to `0`.
- Functions can access outer-scope variables (closures).
- Function names can be reused as types when returning `this`.
- Duplicate parameter names are rejected.
- Duplicate function names are rejected.

Return type inference:

```tuff
fn get() => 100;           // Return type inferred as I32
fn getBool() => true;      // Return type inferred as Bool
```

### Forward references

Functions and type aliases can be referenced before they are defined:

```tuff
fn getA() => getB();       // getB not yet defined
fn getB() => 100;
getA()                     // Evaluates to 100

let x : MyAlias = 50;      // MyAlias not yet defined
type MyAlias = I32;
```

### Generics

Functions can be generic:

```tuff
fn pass<T>(value : T) => value;
pass(100)    // T inferred as I32
```

### Closures and scope

Functions capture outer variables:

```tuff
let mut sum = 0;
fn addOnce() => sum += 1;
addOnce();
sum          // Result is 1
```

## Structs

### Basic structs

Define a struct:

```tuff
struct Point { x : I32; y : I32; }
```

Rules:

- Struct declarations evaluate to `0`.
- Duplicate struct names are rejected.
- Duplicate field names are rejected.

Instantiate using positional struct literals:

```tuff
struct Wrapper { x : I32; }
let value : Wrapper = Wrapper { 100 };
value.x      // Evaluates to 100
```

Important:

- All fields must be provided during instantiation.
- Access non-existent fields is an error.

### Generic structs

```tuff
struct Wrapper<T> { field : T; }
let w : Wrapper<I32> = Wrapper<I32> { 100 };
w.field      // Evaluates to 100
```

Generic struct example with type checking:

```tuff
let wrapper = Wrapper<Bool> { true };
wrapper.field is Bool    // Evaluates to 1 (true)
```

## Arrays

### Array basics

Array literals:

```tuff
[1, 2, 3]
```

Array types include **two size parameters**:

- `[Type; initializedCount; length]`
- `[I32; 1; 3]` means array of length 3 with at least 1 initialized element.

Direct indexing:

```tuff
[1, 2, 3][1]      // Evaluates to 2
```

### Array initialization

Arrays must be initialized in order:

```tuff
let mut a : [I32; 0; 3];
a[0] = 100;           // OK: first element
a[0]                  // OK: element is initialized
a[1] = 200;           // OK: second element
a[1] = 300;           // Error: can't assign a[1] before a[0]
```

Rules:

- You cannot access uninitialized elements.
- You must initialize elements in order from index 0.

### Array bounds checking

Bounds are checked at runtime:

```tuff
let array = [1, 2, 3];
array[1]     // OK: evaluates to 2
array[3]     // Error: out of bounds
array[-1]    // Error: negative index
```

### Array copying restrictions

Non-literal array values cannot be copied:

```tuff
let array : [I32; 3; 3] = [1, 2, 3];
let array2 = array;     // Error: cannot copy arrays
```

### Slices

Slice pointers (`*[Type]`) can be created from arrays and support indexing:

```tuff
let array = [1, 2, 3];
let slice : *[I32] = &array;
slice[0] + slice[1] + slice[2]    // Evaluates to 6
```

Slice pointers can be copied:

```tuff
let array = [1, 2, 3];
let x : *[I32] = &array;
let y = x;              // OK: copying pointer, not array
y[0]                    // Evaluates to 1
```

### Array function parameters

Arrays must have sufficient initialized count:

```tuff
fn getFirst(arr : [I32; 1; 3]) => arr[0];

let mut array : [I32; 0; 3];
getFirst(array);        // Error: insufficient initialized count

array[0] = 100;
getFirst(array);        // OK: evaluates to 100
```

## Pointers and references

### Basic pointers

- Immutable reference: `&x`
- Mutable reference: `&mut x` (requires `x` is `mut`)
- Dereference: `*ptr`

Pointer types:

- `*Type` (immutable pointer)
- `*mut Type` (mutable pointer)

Example:

```tuff
let mut x = 0;
let p : *mut I32 = &mut x;
*p = 100;
x            // Result is 100
```

### Borrowing rules

- You can have multiple immutable references to the same variable.
- You can have only one active mutable reference to the same variable.
- Cannot have both immutable and mutable references simultaneously.

Examples:

```tuff
let mut x = 0;
let y = &x;
let z = &x;       // OK: multiple immutable refs
*y + *z           // OK

let mut a = 0;
let b = &mut a;   // OK: one mutable ref
let c = &mut a;   // Error: cannot have two mutable refs
```

### Pointer type checking

Pointers must match the pointee type:

```tuff
let x = 100;
let y : *Bool = &x;    // Error: type mismatch
```

### Pointer assignment

You cannot assign through immutable pointers:

```tuff
let mut x = 0;
let y = &x;       // Immutable pointer
*y = 100;         // Error: cannot assign through immutable pointer
```

### Pointer equality

Pointers can be compared:

```tuff
object MySingleton {}
&MySingleton == &MySingleton    // Evaluates to 1 (true)
```

## `this` and method-style calls

### The `this` keyword

`this` is a synthetic snapshot of the current scope:

- Access variables via `this.x`.
- Call functions via `this.functionName()`.
- Take references to the scope: `&this` / `&mut this`.
- Type is `This` (immutable) or `*mut This` (mutable).

Example:

```tuff
let x = 100;
this.x       // Evaluates to 100
```

Assignment through `this`:

```tuff
let mut x = 0;
this.x = 100;
x            // Result is 100
```

### Returning `this` (class-like objects)

Functions can return `this` to create class-like objects:

```tuff
fn Point(x : I32, y : I32) => this;
Point(3, 4).x     // Evaluates to 3
```

Functions returning `this` create a type with the same name:

```tuff
fn Counter(start : I32) => {
  let mut count = start;
  fn increment() => count += 1;
  this
};

let c : Counter = Counter(0);   // Type is Counter
c.increment();
c.count       // Evaluates to 1
```

### Nested `this` contexts

Each function scope has its own `this`:

- `this` refers to the current function's scope.
- `this.this` refers to the outer function's scope.
- Deep nesting requires multiple `this` accessors: `this.this.this`.

Example:

```tuff
fn Outer() => {
  let x = 100;
  fn Inner() => {
    let y = 50;
    this.this     // Access outer scope
  };
  Inner().x       // Evaluates to 100 (from Outer)
};
Outer()
```

Deep nesting:

```tuff
fn Level1() => {
  let a = 1;
  fn Level2() => {
    let b = 2;
    fn Level3() => {
      let c = 3;
      this.this.this     // Access Level1
    };
    Level3().a           // Evaluates to 1
  };
  Level2()
};
```

### Method-style calls

Functions can be called on values using dot notation:

- `expr.fn()` calls `fn` with `expr` as the first parameter.
- The first parameter type determines calling style:
  - `this : Type` → call by value
  - `this : *Type` → call by immutable pointer
  - `this : *mut Type` → call by mutable pointer

Example (by-value):

```tuff
fn add(this : I32) => this + 1;
100.add()     // Evaluates to 101
```

Example (mutable pointer):

```tuff
fn addOnce(this : *mut I32) => *this = *this + 1;
let mut y = 100;
y.addOnce();
y             // Result is 101
```

Method not found error:

```tuff
fn List() => { let x = 1; this };
let list = List();
list.getFirst();    // Error: method not found
```

### Method chaining with `this.this`

Methods can return `this.this` to enable chaining:

```tuff
fn Builder() => {
  let mut value = 0;
  fn setValue(v : I32) => {
    this.value = v;
    this.this     // Return outer Builder scope
  };
  this
};

Builder().setValue(42).value    // Evaluates to 42
```

Chaining example:

```tuff
fn Counter() => {
  let mut count = 0;
  fn add(n : I32) => {
    this.count = this.count + n;
    this.this
  };
  this
};

let c = Counter();
c.add(10).add(5).count    // Evaluates to 15
```

Note: Returning `this` (without `.this`) returns the method's own context, not the enclosing scope.

## Function pointers and `::`

### Function pointer types

Functions can be stored in variables:

```tuff
fn get() => 100;
let f : () => I32 = get;
f()           // Evaluates to 100
```

Function pointer type syntax:

- `(param1Type, param2Type) => ReturnType`
- `() => I32` is a function with no parameters returning `I32`.

Returning function pointers:

```tuff
fn get() => 100;
fn pass() : () => I32 => get;
pass()()      // Evaluates to 100
```

### Returning inner functions

Inner functions can be returned:

```tuff
fn outer() => {
  fn inner() => 100;
  inner       // Return function itself
};
outer()()     // Evaluates to 100
```

Captured variables:

```tuff
fn outer(x : I32, y : I32) => {
  fn inner() => x + y;
  this
};
outer(3, 4).inner()    // Evaluates to 7
```

### Extracting unbound function pointers with `::`

The `::` operator extracts an unbound function pointer from a `this` value:

```tuff
fn outer(x : I32, y : I32) => {
  fn inner() => x + y;
  this
};

let o : outer = outer(3, 4);
let innerPtr : *(*outer) => I32 = o::inner;
innerPtr(&o)     // Evaluates to 7 (call with explicit context)
```

Use cases:

- Extracting methods from objects created by functions returning `this`.
- Calling methods with explicit context pointers.

## Type aliases

### Basic type aliases

Define type aliases:

```tuff
type MyAlias = I32;
let x : MyAlias = 100;
x is MyAlias     // Evaluates to 1 (true)
x is I32         // Evaluates to 1 (true)
```

Forward references work:

```tuff
let x : MyAlias = 100;
type MyAlias = I32;
x is I32         // Evaluates to 1 (true)
```

### Type aliases with drop functions

Type aliases can have drop functions that are called when values go out of scope:

```tuff
let mut sum = 0;
fn drop(this : I32) => sum += this;
type MyDroppable = I32 then drop;

let temp : MyDroppable = 100;
sum          // Evaluates to 100 (drop called)
```

Drop functions are invoked when:

- Variables go out of scope (block ends).
- Captured variables are released.

Example with captured variables:

```tuff
let mut freed = 0;
fn free(this : I32) => freed += 1;
type Alloc<T> = T then free;

fn makeValue() => {
  let x : Alloc<I32> = 10;
  this
};
makeValue();
freed        // Evaluates to 1 (x was dropped)
```

### Generic type aliases

Type aliases can be generic:

```tuff
type Wrapper<T> = T;
let x : Wrapper<I32> = 100;
x            // Evaluates to 100
```

Generic pointers:

```tuff
type Ptr<T> = *T;
let x = 100;
let p : Ptr<I32> = &x;
*p           // Evaluates to 100
```

Generic with drop functions:

```tuff
let mut sum = 0;
fn cleanup(this : I32) => sum += this;
type Alloc<T> = T then cleanup;

let x = 50;
let p : Alloc<I32> = x;
sum          // Evaluates to 50 (cleanup called)
```

## Singleton objects

Define singleton objects with state and methods:

```tuff
object MySingleton {
  let mut counter = 0;
  fn add() => counter += 1;
}

MySingleton.add();
MySingleton.counter    // Evaluates to 1
```

Properties:

- Singleton declarations evaluate to `0`.
- Singletons have pointer identity (can compare addresses).
- Methods can access and mutate singleton state.

Pointer identity:

```tuff
object MySingleton {}
&MySingleton == &MySingleton    // Evaluates to 1 (true)
```

## Summary of sharp edges

### Type system

- Numeric literals without suffixes are `I32`.
- Lowercase suffixes (e.g., `u8`) are rejected.
- Narrowing conversions are rejected.
- Bool is a distinct type; arithmetic on booleans errors.
- Overflow checking is based on the widest operand type.

### Variables

- Variables cannot be re-declared in the same scope.
- Uninitialized immutable variables can be assigned once.
- Compound assignments require numeric types.

### Arrays

- Non-literal arrays cannot be copied.
- Array elements must be initialized in order.
- Cannot access uninitialized elements.
- Initialized count and length are tracked separately.

### Pointers

- Only one mutable reference at a time.
- Cannot assign through immutable pointers.

### Functions

- Function definitions evaluate to `0`.
- Void function calls evaluate to `0`.
- Duplicate function/parameter names are rejected.

### `this` and methods

- Each function scope has its own `this`.
- `this.this` accesses outer scope.
- Returning `this` vs. `this.this` affects chaining behavior.
- Methods are resolved by first parameter type.
