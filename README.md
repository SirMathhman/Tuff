# Tuff

A stack-based virtual machine compiler and tiny, type-aware expression language.

Tuff compiles source strings into a compact instruction stream and executes them on a small VM (4 registers + memory).
There is currently **no standalone CLI** in this repository; you typically use it as a library (or via tests).

## Quickstart

### Build & test

```bash
mvn test
mvn verify
```

### Run as a library

- Compile: `App.compile(source)` → `Instruction[]`
- Compile + execute: `App.run(source, int[] input)` → `RunResult` (output list + exit code)
- Execute with tracing: `TraceRunner.runWithTrace(...)`

See `src/test/java/io/github/sirmathhman/tuff/AppTest.java` for many runnable examples.

## Features

### Values, Types, and Literals

Tuff runs on 64-bit VM registers, but the language tracks types at compile time.

- **Integers**: `U8`, `U16`, `U32`, `U64`, `I8`, `I16`, `I32`, `I64` (and other `U<bits>` / `I<bits>` forms).
- **Bool**: `Bool` (values are `0`/`1`; keywords `true` and `false` are supported).
- **Pointers**: `*T` and `*mut T`.
- **Tuples**: `(T1, T2, ...)` with indexing `expr[index]`.
- **Structs**: user-defined named product types.

### Type System

- **Explicit Type Annotations**: Declare variable types explicitly

  ```
  let x : U8 = read U8; x
  ```

- **Type Inference**: Omit type annotations for simpler code

  ```
  let x = read U8; x
  ```

- **Implicit Type Upcasting**: Automatically upcast from smaller to larger types of the same sign

  ```
  let x : U16 = read U8; x  // U8 → U16 (valid)
  let y : U32 = read U16; y  // U16 → U32 (valid)
  ```

- **Downcast Prevention**: Prevents unsafe downcasting operations

  ```
  let x = read U16; let y : U8 = x; y  // Error: U16 → U8 (invalid)
  ```

- **Sign Safety**: Prevents conversion between signed and unsigned types
  ```
  let x : I8 = read U8; x  // Error: unsigned → signed (invalid)
  ```

### Let Bindings

- **Statement-Level Bindings**: Use let bindings at the top level

  ```
  let temp : U8 = read U8 * read U8; temp
  ```

- **Chained Bindings**: Chain multiple let bindings together

  ```
  let x = read U16; let y : U8 = read U8; y
  ```

- **Multiple Variables in Scope**: Reference any previously bound variable

  ```
  let x = read U8; let y = read U8; x  // Reads 2 and 3, returns 2
  ```

- **Expression-Level Bindings**: Nest let bindings inside expressions

  ```
  let temp : U8 = (read U8 + { let x : U8 = read U8; let y : U8 = x; y }) * read U8; temp
  ```

- **Variable Reuse**: Use the same variable multiple times (reads once, uses multiple times)

  ```
  let x = read U8; x + x  // Reads once, adds to itself
  ```

- **Mutable Variables**: Declare variables with `mut` to allow reassignment

  ```
  let mut x = read U8; x = read U8; x  // Reads twice, returns second value
  ```

- **Uninitialized Variables**: Declare with type annotation, assign later

  ```
  let x : I32; x = read I32; x  // Declare, assign, then use
  ```

- **Single Assignment Rule**: Uninitialized variables can only be assigned once

  ```
  let x : U8; x = read U8; x = 100; x  // Error: multiple assignments (invalid)
  ```

- **Mutable Uninitialized Variables**: Declare with `mut` and type annotation for multiple assignments

  ```
  let mut x : U8; x = read U8; x = 100; x  // Reads input, assigns 100, returns 100 (valid)
  ```

### Blocks and `yield`

You can use a scoped block as the initializer of a `let` binding. Inside the block, `yield <expr>` sets the block's value.

```
let x : U8 = { yield read U8; }; x
```

You can also conditionally `yield` early; if no `yield` runs, the final expression becomes the block result.

```
let x = { if (read Bool) yield 100; 200 }; x
```

### Functions

Define functions as `fn name(params...) => expr;` and call them with `name(args...)`.

Inside a function body block, `yield` sets the block value (and evaluation continues), while `return` short-circuits the function body:

```
fn get() => { if (true) yield 100; 50 } + 5; get()   // 105
fn get() => { if (true) return 100; 50 } + 5; get()  // 100
```

You can also bind a function reference to a variable (using a function type annotation) and call it through the binding:

```
fn get() => 100;
let func : () => I32 = get;
func()  // 100
```

Function calls also support:

- `this.functionName(...)` (equivalent to `functionName(...)`)
- method-style calls like `value.functionName()` where the function’s first parameter is named `this`

```
fn addOnce(this : I32) => this + 1;
100.addOnce()  // 101
```

### Structs

Define a struct at statement-level:

```
struct Point { x : U8, y : U8 }
```

Instantiate and access fields:

```
struct Wrapper { value : I32 }
let w : Wrapper = Wrapper { value : read I32 };
w.value
```

Multiple field accesses in one expression are supported:

```
struct Point { x : U8, y : U8 }
let p : Point = Point { x : read U8, y : read U8 };
p.x + p.y
```

### Tuples

Tuples can be constructed and indexed:

```
let t : (U8, U8) = (read U8, read U8);
t[0] + t[1]
```

### Arrays

Arrays are fixed-size homogeneous collections with indexed access:

```
let x : [I32; 3; 3] = [1, 2, 3];
x[0] + x[1] + x[2]  // Returns 6
```

Array type format: `[ElementType; InitializedCount; TotalCount]`

- `ElementType`: Type of array elements (e.g., `I32`, `U8`)
- `InitializedCount`: Number of initial values provided
- `TotalCount`: Total size of the array (must be ≥ InitializedCount)

Arrays support zero-based indexing via `array[index]` syntax.

### Pointers, references, and dereference assignment

Take references with `&` / `&mut` and assign through a pointer with `*ptr = expr`:

```
let mut x = 0;
let p = &mut x;
*p = read I32;
x
```

### Logical Operators

- **Logical OR**: Combine boolean expressions with the `||` operator (lowest precedence)

  ```
  read Bool || read Bool  // Returns 1 if either input is non-zero, 0 otherwise
  ```

- **Logical AND**: Combine boolean expressions with the `&&` operator (higher precedence than OR)

  ```
  read Bool && read Bool  // Returns 1 if both inputs are non-zero, 0 otherwise
  ```

- **Bool Type**: 8-bit integer with values 0 (false) or 1 (true)

  ```
  let x : Bool = read Bool; x  // Read a boolean value
  ```

- **Boolean literals**: `true` and `false`

  ```
  if (true) 1 else 2
  ```

### Comparison Operators

All comparison operators return a boolean value (1 for true, 0 for false):

- **Equality**: `==` - Tests if two values are equal

  ```
  read U32 == read U32  // Returns 1 if equal, 0 otherwise
  ```

- **Inequality**: `!=` - Tests if two values are not equal

  ```
  read U32 != read U32  // Returns 1 if not equal, 0 otherwise
  ```

- **Less Than**: `<` - Tests if left is less than right

  ```
  read U8 < read U8  // Returns 1 if left < right, 0 otherwise
  ```

- **Greater Than**: `>` - Tests if left is greater than right

  ```
  read U8 > read U8  // Returns 1 if left > right, 0 otherwise
  ```

- **Less or Equal**: `<=` - Tests if left is less than or equal to right

  ```
  read U32 <= read U32  // Returns 1 if left <= right, 0 otherwise
  ```

- **Greater or Equal**: `>=` - Tests if left is greater than or equal to right

  ```
  read U32 >= read U32  // Returns 1 if left >= right, 0 otherwise
  ```

### Conditional Expressions

Execute one of two expressions based on a boolean condition:

- **Basic If-Else**: Use `if (condition) trueBranch else falseBranch` syntax

  ```
  if (read Bool) 3 else 5  // Read boolean, return 3 if true, 5 if false
  ```

- **If-Else with Comparisons**: Combine conditionals with comparison operators

  ```
  if (read U8 > read U8) 100 else 50  // Return 100 if first > second, else 50
  ```

- **If-Else in Let Bindings**: Use conditionals within variable assignments

  ```
  let x = if (read Bool) 100 else 50; x  // Bind conditional result to variable
  ```

### Match expressions

Pattern matching is supported via `match` (compiled into nested conditionals):

```
match (read U8) {
  case 0 => 10;
  case 1 => 20;
  case _ => 99;
}
```

### While and for loops

`while` is supported at statement-level:

```
let mut x = 0;
while (x < 5) x = x + 1;
x
```

`for` loops are supported with a range header:

```
let mut sum = 0;
for (let mut i in 0..5) sum += i;
sum
```

## Supported Types

- Unsigned integers: `U8`, `U16`, `U32`, `U64`
- Signed integers: `I8`, `I16`, `I32`, `I64`
- `Bool` (0 or 1)
- Pointers: `*T`, `*mut T`
- Tuples: `(T1, T2, ...)`
- Arrays: `[ElementType; InitializedCount; TotalCount]`

## Operator Precedence

Operators are evaluated in the following order (highest to lowest):

1. Unary: dereference `*`, bitwise NOT `~`, logical NOT `!`
2. Multiplicative: `*`, `/`
3. Additive: `+`, `-`
4. Shifts: `<<`, `>>`
5. Bitwise: `&`, `^`, `|`
6. Comparison: `==`, `!=`, `<`, `>`, `<=`, `>=`
7. Logical AND: `&&`
8. Logical OR: `||`

Examples:

```
2 + 3 * 4              // = 14  (multiply first, then add)
(2 + 3) * 4            // = 20  (parentheses override precedence)
read U8 > 5 && 1       // Comparison before AND
if (read Bool) 3 else 5 // Conditionals at expression level
```

## Code Quality

- Maximum file length: 500 lines (Checkstyle)
- Maximum method length: 50 lines (Checkstyle)
- Maximum parameters per method/constructor: 5 (Checkstyle)
- Maximum record components: 5 (Checkstyle)
- Maximum classes per package: 15 (Python pre-commit hook)
- All tests must pass before commits (pre-commit hook)

### Package Structure Enforcement

The codebase enforces a maximum of 15 classes per package using a Python pre-commit hook. This ensures packages remain focused and maintainable.

The checker runs automatically on commits and will fail if any package exceeds 15 classes. To test it manually:

```bash
python.exe check_package_class_limit.py
```
