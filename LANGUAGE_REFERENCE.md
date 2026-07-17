# Tuff Language Reference

A comprehensive reference for the Tuff programming language with minimal, self-contained code examples for every supported feature. All examples are derived from the test suite and verified to compile and run correctly.

---

## Table of Contents

1. [Basics](#1-basics)
2. [Types](#2-types)
3. [Variables](#3-variables)
4. [Operators](#4-operators)
5. [Control Flow](#5-control-flow)
6. [Functions](#6-functions)
7. [Structs](#7-structs)
8. [Generics](#8-generics)
9. [Arrays](#9-arrays)
10. [Strings](#10-strings)
11. [Pointers](#11-pointers)
12. [Unions](#12-unions)
13. [Tuples](#13-tuples)
14. [Extern FFI](#14-extern-ffi)
15. [Memory Management](#15-memory-management)
16. [Advanced Patterns](#16-advanced-patterns)

---

## 1. Basics

### Line Comments

Single-line comments using `//`.

```tuff
let x = 5; // this is a comment
x
```

**Expected exit code:** `5`

---

### Block Comments

Multi-line comments using `/* ... */`. Content inside string literals is preserved.

```tuff
let x = 5; /* this is a block comment */ x
```

**Expected exit code:** `5`

```tuff
let x = 5; /* this is
a multiline
block comment */ x
```

**Expected exit code:** `5`

```tuff
let str : &Str = "/* not a comment */"
str.length
```

**Expected exit code:** `19` (the `/* */` inside the string is preserved)

---

### Empty Source

An empty source file is valid and produces no output.

```tuff
// (empty)
```

**Expected exit code:** `0`

---

## 2. Types

### Primitive Types

Tuff supports the following primitive types: `I16`, `I32`, `I64`, `U8`, `U16`, `U32`, `U64`, `Bool`, `USize`, `&Str`, `Void`.

```tuff
let x : I32 = 100
x
```

**Expected exit code:** `100`

---

### USize Type

Unsigned size type, used for lengths and sizes.

```tuff
let x : USize = 10
x
```

**Expected exit code:** `10`

---

### Literal Suffixes

Numeric literals can have type suffixes. `U8` literals are validated for range (0–255).

```tuff
100U8
```

**Expected exit code:** `100`

```tuff
let x = 100I64
x is I64
```

**Expected exit code:** `1` (true)

**Invalid examples:**
- `256U8` — out of range
- `-1U8` — negative value

---

### Type Aliases

Create named type synonyms.

```tuff
type MyAlias = I32
let temp : MyAlias = 100
temp is MyAlias && temp is I32
```

**Expected exit code:** `1` (true)

---

### Generic Type Aliases

Type aliases with generic parameters, usable for construction.

```tuff
struct RawBox<T> { field : T }
type Box<T> = RawBox<T>
let temp = Box<I32> { field : 100 }
temp.field
```

**Expected exit code:** `100`

---

### Type Aliases (Non-Generic)

Simple type alias for struct construction.

```tuff
struct Point { x : I32, y : I32 }
type Pt = Point
let p : Pt = Pt { x : 3, y : 4 }
p.x + p.y
```

**Expected exit code:** `7`

---

## 3. Variables

### Let Declarations

Basic variable declaration.

```tuff
let x = 100
x
```

**Expected exit code:** `100`

---

### Let with Type Annotation

Declare a variable with an explicit type.

```tuff
let x : I32 = 100
x
```

**Expected exit code:** `100`

---

### Mutable Variables (`let mut`)

Declare a mutable variable.

```tuff
let mut x = read()
x = read()
x
```

**Stdin:** `1 2`
**Expected exit code:** `2`

---

### Reassignment

Reassign a mutable variable. Non-mutable variables cannot be reassigned.

```tuff
let mut x = 0
x = 1
x = 2
x
```

**Expected exit code:** `2`

---

### Let Shadowing

Redeclaring a variable name shadows the previous binding.

```tuff
let x = read()
let x = read()
x
```

**Stdin:** `1 3`
**Expected exit code:** `3`

---

### Compound Assignment

`+=`, `-=`, `*=`, `/=` on mutable variables.

```tuff
let mut x = read()
x += read()
x
```

**Stdin:** `1 3`
**Expected exit code:** `4`

---

### Block Expressions

Scoped variables inside `{ }` blocks.

```tuff
read() + { let x = read() - read(); x }
```

**Stdin:** `3 4 5`
**Expected exit code:** `2`

---

### Struct Destructuring

Extract struct fields into individual variables.

```tuff
struct Point { x : I32, y : I32 }
let { x, y } = Point { x : 3, y : 4 }
x + y
```

**Expected exit code:** `7`

---

## 4. Operators

### Arithmetic Operators

`+`, `-`, `*`, `/` work on numeric types.

```tuff
read() + read()
```

**Stdin:** `1 2`
**Expected exit code:** `3`

---

### Logical Not (`!`)

Unary negation: `!0` → `1`, `!1` → `0`.

```tuff
!0
```

**Expected exit code:** `1`

```tuff
!1
```

**Expected exit code:** `0`

---

### Logical AND (`&&`)

Short-circuit logical AND.

```tuff
let x : Bool = read<Bool>()
x && false
```

**Stdin:** `true`
**Expected exit code:** `0`

---

### Logical OR (`||`)

Short-circuit logical OR.

```tuff
let x : Bool = read<Bool>()
x || false
```

**Stdin:** `true`
**Expected exit code:** `1`

---

### Comparison Operators

`<`, `==` for binary comparison.

```tuff
read() < read()
```

**Stdin:** `1 2`
**Expected exit code:** `1` (true)

```tuff
read() == read()
```

**Stdin:** `1 2`
**Expected exit code:** `0` (false)

---

### Type-Check Operator (`is`)

Returns `1` if the expression's type matches, `0` otherwise.

```tuff
100 is I32
```

**Expected exit code:** `1`

```tuff
let x = 100
x is I32
```

**Expected exit code:** `1`

```tuff
let x = 100
x is I64
```

**Expected exit code:** `0`

---

### Type Cast (`as`)

Cast an expression to a different type.

```tuff
(100U8 as U16) is U16
```

**Expected exit code:** `1`

---

### Parenthesized Expressions

Strip parentheses and compile the inner expression.

```tuff
(100 is I32)
```

**Expected exit code:** `1`

---

### Braces-to-Parens in Expressions

Braces in expressions are converted to parenthesized sub-expressions.

```tuff
read() + { read() - read() }
```

**Stdin:** `3 4 5`
**Expected exit code:** `2`

---

## 5. Control Flow

### If / Else

Conditional branching.

```tuff
if (read<Bool>()) 3 else 5
```

**Stdin:** `true`
**Expected exit code:** `3`

---

### If / Else with Let

```tuff
let x = if (read<Bool>()) 3 else 5
x
```

**Stdin:** `true`
**Expected exit code:** `3`

---

### If with Mutable Reassignment

```tuff
let mut x = 0
if (read<Bool>()) x = read()
x
```

**Stdin:** `true 3`
**Expected exit code:** `3`

---

### If / Else with Brace Blocks

```tuff
let mut x = 0
if (read<Bool>()) { x = read(); } else { x = read() + 1; }
x
```

**Stdin:** `false 0 8`
**Expected exit code:** `9`

---

### While Loop

```tuff
let mut x = 0
let total = read()
while (x < total) x += 1
x
```

**Stdin:** `4`
**Expected exit code:** `4`

---

### For Loop

Range-based iteration: `for (i in start..end)`.

```tuff
let mut sum = 0
for (i in 0..read()) sum += i
sum
```

**Stdin:** `4`
**Expected exit code:** `6` (0+1+2+3)

---

## 6. Functions

### Function Declaration

```tuff
fn get() => read()
get()
```

**Stdin:** `100`
**Expected exit code:** `100`

---

### Function with Parameters and Return Type

```tuff
fn add(offset : I32) : I32 => read() + offset
add(2)
```

**Stdin:** `1`
**Expected exit code:** `3`

---

### Void Functions

Functions with explicit `Void` return type.

```tuff
fn empty() : Void => {}
```

**Expected exit code:** `0`

---

### Function as Value

Assign a function to a variable and call it.

```tuff
fn get() => 100
let temp = get
temp()
```

**Expected exit code:** `100`

---

### Function Type Annotation

Annotate a function-typed variable.

```tuff
fn get() => 100
let temp : () => I32 = get
temp()
```

**Expected exit code:** `100`

---

### Function Returning Static Array

```tuff
fn makeArray() : [I32; 3] => [1, 2, 3]
let arr = makeArray()
arr[0] + arr[1] + arr[2]
```

**Expected exit code:** `6`

---

### Index Into Function Call Return

```tuff
fn get() => [1, 2, 3]
get()[0]
```

**Expected exit code:** `1`

---

### Struct as Function Parameter

```tuff
struct Point { x : I32, y : I32 }
fn distanceSquared(p : Point) : I32 => p.x * p.x + p.y * p.y
distanceSquared(Point { x : 3, y : 4 })
```

**Expected exit code:** `25`

---

### Static Array as Function Parameter

```tuff
fn sum(arr : [I32; 3]) : I32 => arr[0] + arr[1] + arr[2]
sum([1, 2, 3])
```

**Expected exit code:** `6`

---

## 7. Structs

### Empty Struct

```tuff
struct Empty {}
```

**Expected exit code:** `0`

---

### Struct with Fields

```tuff
struct Point { x : I32, y : I32 }
let p : Point = Point { x : 3, y : 4 }
p.x + p.y
```

**Expected exit code:** `7`

---

### Struct Field Access

```tuff
struct Wrapper { field : I32 }
let wrapper : Wrapper = Wrapper { field : read() }
wrapper.field
```

**Stdin:** `100`
**Expected exit code:** `100`

---

### Nested Struct Types

```tuff
struct Point { x : I32, y : I32 }
struct Wrapper { point : Point }
```

**Expected exit code:** `0`

---

### Struct Array as Function Parameter

```tuff
struct Point { x : I32, y : I32 }
fn sumX(pts : [Point; 2]) : I32 => pts[0].x + pts[1].x
sumX([Point { x : 3, y : 4 }, Point { x : 5, y : 6 }])
```

**Expected exit code:** `8`

---

## 8. Generics

### Generic Functions

```tuff
fn pass<T>(param : T) => param
pass<I32>(read()) + 1
```

**Stdin:** `5`
**Expected exit code:** `6`

---

### Generic Functions with Multiple Type Parameters

```tuff
fn pair<T, U>(a : T, b : U) => a
pair<I32, Bool>(42, read<Bool>())
```

**Stdin:** `true`
**Expected exit code:** `42`

---

### Generic Functions with USize Bound

Type parameters bounded by `USize` for array length inference.

```tuff
fn get<L : USize>(value : I32) : [I32; L] => [value; L]
get<3>(100).length
```

**Expected exit code:** `3`

---

### Generic Array Length Inference

Type parameter inferred from argument array length.

```tuff
fn getLength<L : USize>(array : [I32; L]) : USize => array.length
getLength([0])
```

**Expected exit code:** `1`

```tuff
fn getLength<L : USize>(array : [I32; L]) : USize => array.length
getLength([1, 2])
```

**Expected exit code:** `2`

---

### Generic Structs

```tuff
struct Wrapper<T> { value : T }
let wrapper : Wrapper<I32> = Wrapper<I32> { field : read() }
wrapper.field
```

**Stdin:** `100`
**Expected exit code:** `100`

---

### Generic Structs as Field Types

```tuff
struct Wrapper<T> { value : T }
struct Container { wrapper : Wrapper<I32> }
```

**Expected exit code:** `0`

---

### Generic Structs with Multiple Type Parameters

```tuff
struct Pair<A, B> { first : A, second : B }
struct Container { pair : Pair<I32, Bool> }
```

**Expected exit code:** `0`

---

### Nested Generic Structs

```tuff
struct Wrapper<T> { value : T }
struct Pair<A, B> { first : A, second : B }
struct Container { wrapped : Wrapper<Pair<I32, Bool>> }
```

**Expected exit code:** `0`

---

### Generic Struct with Tuple Type Argument

```tuff
struct Wrapper<T> { value : T }
let w : Wrapper<(I32, I32)> = Wrapper<(I32, I32)> { value : (3, 4) }
w.value.0 + w.value.1
```

**Expected exit code:** `7`

---

### Generic Struct with Nested Generic Tuple

```tuff
struct Wrapper<T> { value : T }
struct Pair<A, B> { first : A, second : B }
let w : Wrapper<(I32, Pair<I32, Bool>)> = Wrapper<(I32, Pair<I32, Bool>)> { value : (5, Pair<I32, Bool> { first : 3, second : 1 }) }
w.value.0 + w.value.1.first
```

**Expected exit code:** `8`

---

### Generic Type Alias Construction

```tuff
struct RawBox<T> { field : T }
type Box<T> = RawBox<T>
let temp = Box<I32> { field : 100 }
temp.field
```

**Expected exit code:** `100`

---

### Generic Struct via Type Alias

```tuff
struct Wrapper<T> { value : T }
type WrapperI32 = Wrapper<I32>
let w : WrapperI32 = WrapperI32 { value : 42 }
w.value
```

**Expected exit code:** `42`

---

## 9. Arrays

### Array Literals

```tuff
let y = [3]
y[0]
```

**Expected exit code:** `3`

---

### Typed Array Declaration

```tuff
let x : [I32; 1] = [100]
x[0]
```

**Expected exit code:** `100`

---

### Array Repeat Syntax

`[value; count]` creates an array with `count` copies of `value`.

```tuff
let x = [10; 2]
x[0] + x[1]
```

**Expected exit code:** `20`

```tuff
let x = [read(); 2]
x[0] + x[1]
```

**Stdin:** `2 5`
**Expected exit code:** `4`

---

### Nested Arrays

```tuff
let y = [[3]]
y[0][0]
```

**Expected exit code:** `3`

---

### Array Element Assignment (Mutable)

```tuff
let mut x = [read()]
x[0] = read()
x[0]
```

**Stdin:** `1 2`
**Expected exit code:** `2`

---

### Array Length Property

```tuff
let array = [1, 2, 3]
let ptr : &[I32] = &array
ptr.length
```

**Expected exit code:** `3`

---

### Fat Pointer Array Length (if/else)

```tuff
let array = [1, 2, 3]
let array2 = [4]
let ptr : &[I32] = if (read<Bool>()) array else array2
ptr.length
```

**Stdin:** `true`
**Expected exit code:** `3`

---

## 10. Strings

### String Literals

```tuff
let str : &Str = "foo"
str.length
```

**Expected exit code:** `3`

---

### String `.length` Property

Generates `(int)strlen(str)` for `&Str` types.

```tuff
let str : &Str = "foo"
str.length
```

**Expected exit code:** `3`

---

### String Length via Generic Function

```tuff
fn pass<T>(value : T) => value
pass<&Str>("foo").length
```

**Expected exit code:** `3`

---

## 11. Pointers

### Pointer Types

```tuff
let x = 100
let y : *I32 = &x
*y
```

**Expected exit code:** `100`

---

### Address-of Operator (`&`)

```tuff
let x = 100
let y : &I32 = &x
*y
```

**Expected exit code:** `100`

---

### Dereference Operator (`*`)

```tuff
let x = 100
let y : &I32 = &x
*y
```

**Expected exit code:** `100`

---

### Pointer Array Indexing

Index into a pointer-typed array.

```tuff
let array = [1, 2, 3]
let temp : &[I32; 3] = &array
temp[0]
```

**Expected exit code:** `1`

---

### Fat Pointer Type Check

```tuff
let array = [1, 2, 3]
let temp = &array
temp is &[I32; 3]
```

**Expected exit code:** `1`

---

## 12. Unions

### Union Type Aliases

```tuff
type MyUnion = I32 | Bool
let value : MyUnion = if (read<Bool>()) 3 else true
value is Bool
```

**Stdin:** `false`
**Expected exit code:** `1`

---

### Tagged Unions with Struct Variants

```tuff
struct Ok { value : I32 }
struct Err { error : &Str }
type Result = Ok | Err
let result : Result = Ok { value : read() }
result is Ok
```

**Stdin:** `3`
**Expected exit code:** `1`

---

### Tagged Unions with If/Else

```tuff
struct Ok { value : I32 }
struct Err { error : &Str }
type Result = Ok | Err
let result : Result = if (read<Bool>()) Ok { value : read() } else Err { error : "foo" }
result is Ok
```

**Stdin:** `false`
**Expected exit code:** `0`

---

## 13. Tuples

### Tuple Literals

```tuff
let x : (I32, I32) = (3, 4)
x.0 + x.1
```

**Expected exit code:** `7`

---

### Tuples as Struct Field Types

```tuff
struct Point { coords : (I32, I32) }
let p = Point { coords : (3, 4) }
p.coords.0 + p.coords.1
```

**Expected exit code:** `7`

---

### Tuples as Generic Type Arguments

```tuff
struct Wrapper<T> { value : T }
let w : Wrapper<(I32, I32)> = Wrapper<(I32, I32)> { value : (3, 4) }
w.value.0 + w.value.1
```

**Expected exit code:** `7`

---

## 14. Extern FFI

### Extern Function Import

```tuff
extern let { atoi } = extern stdlib
extern fn atoi(str : &Str) : I32
atoi("7")
```

**Expected exit code:** `7`

---

### Extern Function with Multiple Imports

```tuff
extern let { strtol } = extern stdlib
extern fn strtol(str : &Str, end : &Str, base : I32) : I64
let x : I64 = strtol("100", 0, 10)
x is I64
```

**Expected exit code:** `1`

---

### Extern Type Imports

```tuff
extern let { type uint8_t } = extern stdint
sizeOf<uint8_t>()
```

**Expected exit code:** `1`

---

### Extern Function Type Checking

Extern functions support `is` type checks.

```tuff
extern let { strtol } = extern stdlib
extern fn strtol(str : &Str, end : &Str, base : I32) : I64
let x : I64 = strtol("100", 0, 10)
x is I64
```

**Expected exit code:** `1`

---

### Extern Generic Functions

```tuff
extern let { malloc } = extern stdlib
extern fn malloc<T>(size : USize) : &[T; 1]
let mut ptr = malloc(sizeOf<&Str>())
ptr[0] = "foo"
```

**Expected exit code:** `0`

---

### Extern Generic Functions with Explicit Type Args

```tuff
extern let { malloc } = extern stdlib
extern fn malloc<T, L : USize>(size : USize) : &[T; L]
let temp = malloc<I32, 3>(10)
temp is &[I32; 3]
```

**Expected exit code:** `1`

---

### Extern Generic Function Return Type Inference

```tuff
extern let { malloc, free } = extern stdlib
extern fn malloc<T>(size : USize) : &[T; 1]
extern fn free(ptr : &[&Str; 1]) : Void
let mut ptr = malloc(sizeOf<&Str>())
ptr[0] = "foo"
free(ptr)
```

**Expected exit code:** `0`

---

## 15. Memory Management

### sizeOf Operator

```tuff
sizeOf<I32>()
```

**Expected exit code:** `4`

```tuff
sizeOf<U64>()
```

**Expected exit code:** `8`

---

### sizeOf Returns USize

```tuff
sizeOf<U64>() is USize
```

**Expected exit code:** `1`

---

### sizeOf in Expressions

```tuff
let size = sizeOf<I32>() * 10
size is USize
```

**Expected exit code:** `1`

---

### Drop Types (Destructors)

Type aliases with destructor functions called on variable lifetime end.

```tuff
let mut dropped = false
fn drop() => { dropped = true; }
type DroppableI32 = I32 then drop
let temp : DroppableI32 = 100
dropped
```

**Expected exit code:** `1`

---

### Drop Types with Struct Aliases

```tuff
struct RawBox { field : I32 }
let mut counter = 0
fn drop(box : Box) : Void => { counter += box.field; }
type Box = RawBox then drop
let box = Box { field : 100 }
counter
```

**Expected exit code:** `100`

---

### Drop with Value Parameter

```tuff
let mut counter = 0
fn drop(this : I32) => { counter += this; }
let foo : I32 then drop = 100
counter
```

**Expected exit code:** `100`

---

### Drop with Inline Struct

```tuff
struct Raw { field : I32 }
let mut counter = 0
fn drop(this : Raw) => { counter += this.field; }
let foo : Raw then drop = Raw { field : 100 }
counter
```

**Expected exit code:** `100`

---

## 16. Advanced Patterns

### Rest Parameters

Collect variadic arguments into an array; `L` is inferred from argument count.

```tuff
fn toArray<L : USize>(...args : [I32; L]) : [I32; L] => args
toArray(1, 2, 4).length
```

**Expected exit code:** `3`

---

### Captured Variables

Functions that modify outer mutable variables; captured vars become `static int` globals.

```tuff
let mut x = 0
fn add() => { x += 1; }
add()
x
```

**Expected exit code:** `1`

---

### Functions Reading Outer Static Arrays

```tuff
let arr = [10, 20, 30]
fn get() => { arr[1] }
get()
```

**Expected exit code:** `20`

---

### This References

`this.x` resolves `.x` to variable `x` when no struct context.

```tuff
let x = 100
this.x
```

**Expected exit code:** `100`

---

### This as Value

```tuff
let x = 100
let temp = this
temp.x
```

**Expected exit code:** `100`

---

### This with Mutable Reassignment

```tuff
let mut x = 100
this.x = 0
x
```

**Expected exit code:** `0`

---

### Nested Functions

Functions defined inside other functions with closure capture.

```tuff
fn outer() => { fn inner() => 100; inner() }
outer()
```

**Expected exit code:** `100`

---

### Nested Functions Modifying Outer Mut

```tuff
fn outer() => { let mut counter = 0; fn add() => { counter += 1; }; add(); counter }
outer()
```

**Expected exit code:** `1`

---

### Factory Pattern

Return `this` from a factory function, call methods via `Factory().method()`.

```tuff
fn Factory() => { fn get() => 100; this }
Factory().get()
```

**Expected exit code:** `100`

---

### Receiver Parameters (`&this`)

Explicit `this` receiver on nested methods.

```tuff
fn Factory() => { fn get(&this) => 100; this }
Factory().get()
```

**Expected exit code:** `100`

---

### Explicit This Type Receiver

```tuff
fn Factory() => { fn get(this : &Factory) => 100; this }
Factory().get()
```

**Expected exit code:** `100`

---

### Factory with Mutable State

```tuff
fn Counter() => { let mut value = 0; fn add() => { value += 1; }; this }
let counter : Counter = Counter()
counter.add()
counter.value
```

**Expected exit code:** `1`

---

### Factory Type Checking

```tuff
fn Counter() => { let mut value = 0; fn add() => { value += 1; }; this }
Counter() is Counter
```

**Expected exit code:** `1`

---

### Per-Instance State (Independent Counters)

Each factory call gets independent state.

```tuff
fn Counter() => {
    let mut value = 0
    fn add(&mut this) => { value += 1; }
    this
}
let mut first = Counter()
first.add()
first.add()
let mut second = Counter()
second.add()
first.value
```

**Expected exit code:** `2`

---

### Nested Factory Chained Calls

```tuff
fn Outer() => {
    fn Inner() => {
        fn get() => 100
        this
    }
    this
}
Outer().Inner().get()
```

**Expected exit code:** `100`

---

### Nested Factory with Parameters

```tuff
fn Outer(foo : I32) => {
    fn Inner(bar : I32) => {
        fn sum() => foo + bar
        this
    }
    this
}
Outer(25).Inner(75).sum()
```

**Expected exit code:** `100`

---

### Triple-Nested Factory

```tuff
fn a() => {
    fn b() => {
        fn c() => 100
        this
    }
    this
}
a().b().c()
```

**Expected exit code:** `100`

---

### This Return from Function

```tuff
fn Wrapper() => { let field = 100; this }
Wrapper().field
```

**Expected exit code:** `100`

---

### Generic Read with Function Parameters

```tuff
fn add(first : U64, second : U64) => first + second
add(read<U64>(), read<U64>())
```

**Stdin:** `50\n50`
**Expected exit code:** `100`

---

## Error Cases

The following patterns cause compilation errors:

| Pattern | Reason |
|---------|--------|
| `256U8` | U8 literal out of range |
| `-1U8` | Negative U8 literal |
| `let x : I32 = [100]` | Type mismatch: array assigned to scalar |
| `let x : [I32; 1] = []` | Array size mismatch |
| `let x = read(); x = read()` | Reassignment without `mut` |
| `let x = read(); x += read()` | Compound assignment without `mut` |
| `let x = [read()]; x[0] = read()` | Array element assignment without `mut` |
| `undefinedFunction()` | Undefined function call |
| `struct Empty { field : I32, field : I32 }` | Duplicate struct field |
| `struct Empty {} struct Empty {}` | Duplicate struct definition |
| `struct Wrapper { field : UnknownType }` | Unknown struct field type |
| `fn test(random : UnknownType) => {}` | Unknown function param type |
| `fn get() : UnknownType => {}` | Unknown function return type |
| `struct Wrapper { field }` | Missing struct field type |
| `type Temp = I32 then undefinedDropFn` | Undefined drop function |
| `extern let { malloc } = extern stdlib; malloc()` | Extern function used without `extern fn` declaration |

---

*Generated from the Tuff test suite (145+ end-to-end tests). All examples verified against `cargo test`.*
