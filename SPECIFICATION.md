# System Specification: Tuff Programming Language

## 1. Purpose and Scope

### Core Purpose

Tuff is a statically-typed, compiled programming language that combines the expressiveness and flexibility of TypeScript with the performance of C, while guaranteeing memory safety and correctness through compile-time proofs. The language is designed to produce AI-safe code: if code compiles, it is mathematically proven to be free from common safety violations (buffer overflows, null dereferences, data races, division by zero, integer overflow/underflow).

### Target Users

- **Systems programmers**: Building low-level, performance-critical software
- **Application developers**: Creating web, mobile, and desktop applications
- **Domain-specific experts**: Finance, science, and specialized domains requiring both safety and performance

### Success Criteria

- AI-generated code in Tuff is perfectly safe by construction
- Code does not panic at runtime
- The API surface is fully safe (no `unsafe` escape hatch in Tuff itself)
- Developers can write expressive, high-level code that compiles to efficient native code or JavaScript
- The type system catches all memory safety and arithmetic errors at compile time

### Inspiration

Tuff draws inspiration from:

- **Rust**: Ownership, borrowing, memory safety
- **TypeScript**: Type flexibility, structural typing, developer experience
- **C**: Performance, predictability, bare-metal access
- **Kotlin**: Multiplatform design (actual/expect), pragmatic syntax
- **Java**: Module/package system

---

## 2. Domain Model

### 2.1 Type System

#### Primitive Types

**Integers**:

- Signed: `I8`, `I16`, `I32`, `I64`, `I128`
- Unsigned: `U8`, `U16`, `U32`, `U64`, `U128`
- Pointer-sized: `ISize`, `USize`

**Floating Point**:

- `F32`, `F64`

**Other Primitives**:

- `Bool`: Boolean values
- `Char`: Unicode character
- `*Str`: Pointer to string (static string)
- `Str[N]`: String with compile-time known length N

#### Type System Features

**Refinement Types**: Types with predicates constraining their values.

```tuff
USize < 100        // unsigned integers less than 100
I32 != 0           // non-zero integers
I32 > 10           // integers greater than 10
```

**Literal Types**: Types representing exact values.

```tuff
5I32               // exactly the value 5
x + 3I32           // dependent on variable x
8I32               // fully evaluated literal
```

**Dependent Types**: Types that reference runtime values in their constraints.

```tuff
fn mapOverAll<T, R, L : USize>(
    slice : *[T; L; _],
    closure : (T) => R
) : [R; L; L]
```

**Generic Types**: Parametric polymorphism with constraints.

```tuff
fn divide(numerator : I32, denominator : I32 != 0) => numerator / denominator;
fn printSomething<T : Display>(value : T) => { ... }
```

**Union Types**: Sum types combining multiple types.

```tuff
type Option<T> = Some<T> | None<T>
type Status = Active | Inactive | Pending
*Type | 0          // nullable pointer (pointer or null)
```

**Error-Result Union**: Special union for error handling.

```tuff
type Result<T, X> = Ok<T> |> Err<X>
// The |> operator indicates which side the ? operator extracts
```

#### Composite Types

**Structs**: Product types with named fields.

```tuff
struct Point {
    x : I32,
    y : I32
}

struct Some<T> {
    value : T;
}
```

**Object Singletons**: Type-parameterized singleton instances.

```tuff
object None<T> {}
// Each type instantiation is a distinct singleton:
// &Object<I32> == &Object<I32>
// &Object<I32> != &Object<U32>
```

**Tuples**: Anonymous product types.

```tuff
(I32, Bool, *Str)
```

**Type Aliases**: Named references to types.

```tuff
type Option<T> = Some<T> | None<T>;
```

#### Arrays and Pointers

**Array Types**: Track initialization and capacity.

```tuff
[T; InitCount; TotalCount]
// InitCount: number of initialized elements
// TotalCount: total capacity

[I32; 5; 10]      // array with 5 initialized, capacity 10
```

**Array Pointers**:

```tuff
*[T; I; C]        // pointer to array with known sizes at compile time
*[T]              // pointer to array with runtime size
                  // provides .init and .length properties at runtime
```

**Pointer Types**:

```tuff
*T                // immutable pointer (borrow)
*mut T            // mutable pointer (mutable borrow)
*Type | 0         // nullable pointer (pointer or null)
```

### 2.2 Traits and Interfaces

**Trait Definition**:

```tuff
contract Display {
    fn toString() : String;
}

contract Comparable<T> {
    fn compare(other : T) : I32;
}
```

**Trait Implementation** (three approaches):

1. **Inline with struct/class**:

```tuff
class fn Car() => {
    fn toString() => "Car";
    with Display;
}
```

2. **External implementation for class**:

```tuff
class fn Car() => {}

impl Display for Car {
    fn toString() => "Car";
}
```

3. **External implementation for struct**:

```tuff
struct Car { }

impl Display for Car {
    fn toString() => "Car";
}
```

**Default Methods**: Traits can provide default implementations.

**Trait Bounds**: Constrain generic types to implement specific traits.

```tuff
fn print<T : Display>(item : T) => { ... }
fn compare<T : Comparable<T>>(a : T, b : T) => { ... }
```

### 2.3 Lifetimes and Ownership

**Ownership Model**: Rust-style ownership and borrowing.

**Lifetime Annotations**: Both explicit and automatically inferred by the compiler.

**Borrow Rules**:

- One mutable borrow XOR multiple immutable borrows
- References cannot outlive their referents
- Enforced at compile time through lifetime analysis

### 2.4 Entities and Relationships

**Key Language Entities**:

- **Variables**: Immutable by default, must be explicitly marked mutable
- **Functions**: First-class values, can be passed and returned
- **Closures**: Functions that capture their environment
- **Structs**: Data structures with named fields
- **Objects**: Singleton instances (generic over type parameters)
- **Traits**: Interface specifications
- **Modules**: Code organization units (Java-style packages)
- **Types**: Both primitive and composite

**Relationships**:

- Structs and objects can implement traits
- Functions can be members of structs via impl blocks
- Modules contain types, functions, and sub-modules
- Generic types are parameterized by other types
- Arrays have elements of a homogeneous type
- Pointers reference values with specific lifetimes

---

## 3. Functional Requirements

### 3.1 Variable Declarations

**Syntax**:

```tuff
let name : Type = value;
let x : I32 = 100;
let y = 200;              // type inference
```

**Immutability**: All bindings are immutable by default.

**No Shadowing**: Variable shadowing is a compile error. Each variable must have a unique name in its scope.

**Type Inference**: The compiler infers types when possible, but explicit annotations are allowed.

### 3.2 Functions

**Definition Syntax**:

```tuff
// Expression form (requires semicolon)
fn add(first : I32, second : I32) : I32 => first + second;

// Block form (no semicolon after brace)
fn multiply(a : I32, b : I32) : I32 => {
    a * b
}
```

**Generic Functions**:

```tuff
fn identity<T>(value : T) : T => value;

fn mapOverAll<T, R, L : USize>(
    slice : *[T; L; _],
    closure : (T) => R
) : [R; L; L] => {
    slice.iter().map(closure).toStackArray()
}
```

**Methods**: Two approaches for adding methods to types.

1. **Impl blocks**:

```tuff
impl Point {
    fn distance() : F64 => { ... }
}
```

2. **Standalone functions with `this` parameter**:

```tuff
fn distance(this : *Point) : F64 => { ... }
```

### 3.3 Closures

**Closure Syntax**:

```tuff
(param : Type) => body
(x : I32, y : I32) => x + y
```

**Explicit Captures**:

```tuff
fn outer() : () => Void => {
    let x = 10;
    let y = 20;

    // Capture list specifies how variables are captured
    fn inner[*x, *mut y, z]() => {
        // *x: immutable borrow of x
        // *mut y: mutable borrow of y
        // z: move z (take ownership)
    }

    inner
}
```

**Closure vs Function Pointer Types**:

```tuff
Closure : () => Void
Pointer : *() => Void
```

### 3.4 Structs and Objects

**Struct Definition**:

```tuff
struct Point {
    x : I32,
    y : I32
}
```

**Struct Instantiation**:

```tuff
let myPoint : Point = Point { x : 100, y : 100 };
```

**Object Singleton**:

```tuff
object None<T> {}
// Creates a singleton for each type instantiation
```

**Class Syntax** (syntactic sugar):

```tuff
class fn Car() => { }

// Desugars to:
fn Car() => { this }

// Which desugars to:
struct Car { }
fn Car() => {
    let this = Car {};
    this
}
```

### 3.5 Pattern Matching

**Match Expression**:

```tuff
match (option) {
    case Some { value } = doSomething(value);
    case None = doNothing();
}
```

**Is Expression**:

```tuff
if (option is Some { value }) {
    doSomething(value)
} else {
    doNothing()
}
```

**Optional Unwrapping**:

```tuff
let value = option?;
// Extracts value from Some, propagates None
```

**Pattern Features**:

- **Exhaustiveness checking**: Compiler verifies all cases are covered
- **Range patterns**: `case 0..10`
- **Multiple patterns per arm**: `case A | B`
- **Wildcard pattern**: `case _`
- **Variable binding**: Destructure and bind values from patterns

### 3.6 Control Flow

**Loops**:

```tuff
// Range-based for
for (i in 0..10) {
    // iterate from 0 to 9
}

// While loop
while (condition) {
    // body
}

// Infinite loop
loop {
    // body
    if (shouldBreak) break;
}
```

**Iterators**:

```tuff
array.iter().map(transform).collect()
```

### 3.7 Async/Await

**Purpose**: Syntactic sugar for continuation-passing style (CPS).

**No Runtime Overhead**: Async/await is a pure syntactic transformation with no runtime concurrency primitives.

**Transformation**:

```tuff
// Source
async fn foo() : I32 => {
    return 100;
}

// Desugars to
fn foo() : Void => (consumer : (I32) => Void) : Void => {
    consumer(100);
}
```

**Semantics**: Transparent callbacks without implicit runtime behavior.

### 3.8 Modules and Imports

**Module Structure**: Java-style package system.

**File Mapping**:

```tuff
com::meti::SomeModule → com/meti/SomeModule.tuff
```

**Nested Modules**:

```tuff
// In file com/meti/SomeModule.tuff
module Nested {
    // contents
}

// Accessed as: com::meti::SomeModule::Nested
```

**Import Syntax**:

```tuff
let { Thing, Thing2 } = com::meti::SomeModule;
```

### 3.9 Foreign Function Interface

**External Declarations**:

```tuff
extern fn someFunction(param : I32) : I32;
extern type OpaqueHandle;
extern let globalValue : *Str;
```

**Safety**: All `extern` declarations are assumed to be compile-time safe. Unsafe operations must be implemented in C, JavaScript, or other languages and exposed via FFI.

### 3.10 Visibility and Access Control

**Visibility Keyword**: `out` (instead of `pub` or `public`)

**Default**: Private by default.

**Usage**:

```tuff
out struct PublicStruct { }
out fn publicFunction() => { }

struct PrivateStruct { }
fn privateFunction() => { }
```

---

## 4. Edge Cases and Error Handling

### 4.1 Division by Zero

**Requirement**: Denominator must be proven non-zero at compile time.

**Example**:

```tuff
// COMPILE ERROR
let x : I32 = readIntFromUser();
let y = 100 / x;

// CORRECT
let x : I32 = readIntFromUser();
let y = if (x == 0) 0 else 100 / x;
// In the else branch, the compiler knows x != 0
```

**Generic Functions**:

```tuff
fn divide(numerator : I32, denominator : I32 != 0) => numerator / denominator;
// Caller must prove denominator != 0
```

### 4.2 Integer Overflow and Underflow

**Addition Overflow**: For `A + B`, requires `A + B <= Max<Widest<A, B>>` proven at compile time.

**Subtraction Underflow**: For `A - B`, requires `A - B >= Min<Narrowest<A, B>>` proven at compile time.

**Compile-Time Verification**: The type system tracks value ranges and proves operations stay within bounds.

**Unprovable Cases**: Must use explicit checks (similar to division by zero).

### 4.3 Array Out of Bounds

**Array Type**: `[T; InitCount; TotalCount]`

**Read Operations**: For array `A[k]`, k must have type `USize < InitCount` (proven at compile time).

**Write Operations**: For array `A[k]`, k must have type `USize < InitCount + 1` (allows writing to one past initialized).

**Compile-Time Constraints**: `InitCount <= TotalCount` is guaranteed.

**Dynamic Indexing Example**:

```tuff
// COMPILE ERROR
let array : *[I32] = getArray();
let i : USize = getUserInput();
let element : I32 = array[i];

// CORRECT
let array : *[I32] = getArray();
let i : USize = getUserInput();
let element = if (i < array.length) array[i] else 0;
// In the true branch, compiler knows i < array.length
```

### 4.4 Loop Safety

**Sequential Initialization**: Arrays are initialized sequentially. You cannot initialize `arr[i + 1]` before `arr[i]`.

**Loop Bounds**: The compiler understands iteration bounds.

```tuff
for (i in 0..arr.length) {
    arr[i] = 0;  // Proven safe: i is always < arr.length
}
```

### 4.5 Null Pointer Dereferences

**No Null**: The language has no `null` keyword.

**Nullable Pointers**: Expressed as union with zero.

```tuff
*Type | 0        // nullable pointer
```

**Optional Values**: Use `Option<T>` type.

```tuff
type Option<T> = Some<T> | None<T>
```

**Pointer Guarantees**: A pointer `*T` is always aligned and has a valid value.

### 4.6 Type Conversions

**Subtype to Supertype**: `I32 < 100` is assignable to `I32` (safe).

**Supertype to Subtype**: `I32` is NOT assignable to `I32 < 100` (compile error - requires proof).

**Type Narrowing**: Use control flow to prove refinements.

```tuff
let x : I32 = getValue();
// x cannot be assigned to I32 < 100

if (x < 100) {
    // Here, compiler knows x : I32 < 100
    let refined : I32 < 100 = x;  // OK
}
```

### 4.7 Result and Option Handling

**Result Type**:

```tuff
struct Ok<T> { value : T; }
struct Err<X> { error : X; }
type Result<T, X> = Ok<T> |> Err<X>;
```

**Option Type**:

```tuff
struct Some<T> { value : T; }
object None<T> {}
type Option<T> = Some<T> | None<T>;
```

**Error Propagation**: The `?` operator extracts `Ok` and propagates `Err` (or extracts `Some` and propagates `None`).

**No Panics**: The language guarantees no runtime panics. All errors must be handled explicitly through control flow or propagated via `?`.

### 4.8 Data Races

**Prevention**: Ownership and borrowing rules prevent data races at compile time.

**Borrow Rules**:

- At any time, you can have either one mutable reference or any number of immutable references
- References must always be valid

**Concurrency**: Async/await is syntactic (CPS transformation). Underlying concurrency model is not yet specified, but data-race freedom is guaranteed through ownership.

---

## 5. Non-Functional Requirements

### 5.1 Performance

**Native Compilation**: LLVM backend produces optimized machine code with C-like performance.

**Zero-Cost Abstractions**: High-level features (generics, traits, etc.) have no runtime overhead.

### 5.2 Compilation Targets

**Primary Targets**:

1. **Native**: LLVM-based compilation to machine code
2. **JavaScript**: Compile to JavaScript for web/cross-platform
3. **Tuff**: Self-hosted backend (interpreter or JIT)

**Platform Differences**: Handle platform-specific code using Kotlin's actual/expect pattern.

```tuff
// Expected declaration
expect fn platformSpecific() : I32;

// Actual implementation (per platform)
actual fn platformSpecific() : I32 => {
    // Platform-specific code
}
```

### 5.3 Interoperability

**C ABI**: Compatible with C calling conventions and data layout.

**LLVM Compatibility**: Can interoperate with other LLVM-based languages (potentially Rust).

**JavaScript**: Can compile to and interact with JavaScript.

**FFI**: Via `extern` declarations for functions, types, and values.

### 5.4 Safety Guarantees

**Memory Safety**: No buffer overflows, no use-after-free, no double-free.

**Type Safety**: All operations are type-checked at compile time.

**Arithmetic Safety**: No integer overflow/underflow, no division by zero.

**Null Safety**: No null pointer dereferences.

**Thread Safety**: No data races (guaranteed by ownership).

**No Unsafe**: There is no `unsafe` keyword in Tuff. All potentially unsafe operations must be implemented in external languages (C, JS) and exposed via FFI (which is assumed safe).

### 5.5 Developer Experience

**Type Inference**: Extensive type inference reduces annotation burden.

**Clear Error Messages**: Compiler should provide actionable diagnostics (philosophy not yet specified in detail).

**Tooling**:

- Cargo-like or npm-like build system and package manager
- Code formatter (planned)
- Linter (planned)
- Language server for IDE support (planned)

### 5.6 Code Organization

**Entry Point**: Top-level execution like TypeScript (no required `main()` function).

**File Extension**: `.tuff`

**Module System**: Java-style packages with directory-based mapping.

---

## 6. Data Requirements

### 6.1 Primitive Literals

**Integer Literals**:

```tuff
100              // decimal
0xFF             // hexadecimal
0b1010           // binary
0o777            // octal (presumably)
```

**Float Literals**:

```tuff
1.0
1e10
3.14159
```

**Character Literals**:

```tuff
'a'
'Z'
'\n'
```

**String Literals**:

```tuff
"hello"
"world"
```

### 6.2 Type Inference

**Literal Type Inference**: Literals have precise types.

```tuff
let x : 5I32 = 5;          // exactly 5
let y : x + 3I32 = x + 3;  // dependent type
```

**Default Integer Type**: Likely `I32` (not explicitly specified).

**Default Float Type**: Likely `F64` (not explicitly specified).

### 6.3 Comments and Documentation

**Line Comments**:

```tuff
// This is a line comment
```

**Block Comments**:

```tuff
/*
 * This is a
 * block comment
 */
```

**Documentation Comments**:

```tuff
/**
 * # Function Name
 *
 * ## Description
 * Markdown documentation here
 *
 * ## Parameters
 * - `param`: Description
 *
 * ## Returns
 * Description of return value
 */
fn someFunction(param : I32) : I32 => { ... }
```

---

## 7. External Dependencies

### 7.1 Compilation Infrastructure

**LLVM**: Required for native code generation.

**JavaScript Runtime**: For JavaScript compilation target.

**Build System**: Cargo-like or npm-like dependency manager and build orchestration.

### 7.2 Foreign Functions

**C Libraries**: Can call C functions via FFI.

**JavaScript Libraries**: Can interoperate with JavaScript when targeting JS.

**Safety Contract**: All external code accessed via `extern` declarations is assumed to maintain Tuff's safety guarantees.

---

## 8. Constraints and Assumptions

### 8.1 Design Constraints

**No Operator Overloading**: Operators (+, -, \*, etc.) cannot be overloaded. This keeps semantics clear and predictable.

**No Unsafe Keyword**: Tuff has no escape hatch for unsafe operations within the language itself. Unsafe operations must be in external languages.

**No Shadowing**: Variable names must be unique within a scope.

**Compile-Time Proofs**: Core safety guarantees rely on the compiler's ability to prove properties at compile time. When proofs fail, explicit runtime checks are required via control flow.

**Sequential Array Initialization**: Arrays must be initialized in order. You cannot write to `arr[i+1]` before `arr[i]` is initialized.

### 8.2 Assumptions

**Smart Compiler**: The compiler is assumed to be sophisticated enough to:

- Track refinement types through control flow
- Infer literal and dependent types
- Prove arithmetic safety constraints
- Understand loop iteration bounds

**AI Code Generation**: The target use case includes AI-generated code, which must type-check to be safe.

**External Safety**: Code exposed via `extern` is assumed to maintain safety guarantees (developers are responsible for this).

**Recursive Types**: Recursive types must use pointers to ensure compile-time known size for stack allocation.

### 8.3 Undecided Areas

**Macros**: Not yet decided. No macro system currently specified.

**Attributes**: Not yet decided. No attribute or annotation system currently specified.

**Standard Library**: Scope and contents not yet defined (user chose not to discuss at this time).

**Const/Static**: No explicit `const` or `static` keywords specified (though compile-time evaluation is supported).

**Explicit Runtime Concurrency Model**: Async/await desugars to CPS, but the underlying threading or task model is not specified.

**Integer and Float Type Inference Defaults**: Not explicitly specified which default types are inferred.

---

## 9. Acceptance Criteria

A Tuff implementation is correct if it satisfies the following:

### 9.1 Compilation and Type Checking

1. **Type Safety**: All well-typed programs are memory safe and arithmetically safe.
2. **Refinement Types**: The compiler correctly tracks and enforces refinement predicates.
3. **Flow-Sensitive Typing**: The compiler narrows types through control flow (if-else, match).
4. **Exhaustiveness**: Pattern matches are verified to be exhaustive.

### 9.2 Runtime Guarantees

1. **No Panics**: Well-typed programs never panic, crash, or have undefined behavior (excluding bugs in extern code).
2. **No Buffer Overflows**: Array accesses are proven safe at compile time.
3. **No Null Dereferences**: Pointers are always valid or explicitly nullable with checks.
4. **No Integer Overflow/Underflow**: Arithmetic operations are proven safe at compile time or require explicit checks.
5. **No Division by Zero**: Division operations are proven safe at compile time or require explicit checks.
6. **No Data Races**: Ownership and borrowing prevent concurrent data races.

### 9.3 Compilation Targets

1. **LLVM Native**: Produces efficient machine code comparable to C.
2. **JavaScript**: Produces valid JavaScript that interoperates with JS ecosystems.
3. **Tuff Backend**: Self-hosted execution (if/when implemented).

### 9.4 Behavioral Correctness

1. **Semantics Preservation**: High-level abstractions (generics, traits) compile to correct low-level code.
2. **Async/Await**: Desugars correctly to CPS without introducing unexpected behavior.
3. **Borrow Checking**: Prevents use-after-free and aliasing violations.

### 9.5 Developer Experience

1. **Type Inference**: Reduces annotation burden while maintaining clarity.
2. **Error Messages**: Compilation errors are clear and actionable (specific quality metrics not yet defined).
3. **Tooling**: Build system, formatter, and linter work correctly (when implemented).

### 9.6 Testing and Validation

**Test Framework**: `describe`/`expect` BDD-style testing works correctly.

**Example**:

```tuff
describe("Math operations") {
    expect(add(2, 3)).toBe(5);
    expect(divide(10, 2)).toBe(5);
}
```

---

## 10. Open Questions

This section intentionally left empty - all critical requirements have been specified.

**Deferred for future specification**:

- Macros and compile-time metaprogramming
- Attributes/annotations system
- Standard library design and scope
- Exact syntax for `const` and `static` declarations
- Specific runtime model for async/await (beyond CPS transformation)
- Error message quality guidelines
- Versioning and stability guarantees
- Cross-compilation details
- Debugger integration
- Performance benchmarking methodology

These areas are acknowledged but not currently blocking the core language specification.

---

## Appendix A: Syntax Summary

### A.1 Keywords

```
fn, let, struct, object, type, contract, impl, with, match, case, if, else,
while, for, loop, in, async, extern, out, module, return, break, continue, is
```

### A.2 Operators

**Arithmetic**: `+`, `-`, `*`, `/`, `%`

**Comparison**: `==`, `!=`, `<`, `>`, `<=`, `>=`

**Logical**: `&&`, `||`, `!`

**Union**: `|` (type union), `|>` (error-result union)

**Range**: `..` (exclusive range)

**Nullable**: `| 0` (union with zero for null)

**Unwrap**: `?` (optional/result unwrapping)

**Type Constraint**: `:` (type annotation), `!=`, `<`, `>`, `<=`, `>=` (in types)

**Wildcard**: `_` (pattern matching wildcard)

### A.3 Example Program

```tuff
/**
 * A simple program demonstrating Tuff's key features
 */

// Define a point struct
struct Point {
    x : I32,
    y : I32
}

// Implement methods for Point
impl Point {
    fn distance(this : *Point) : F64 => {
        let dx = this.x * this.x;
        let dy = this.y * this.y;
        sqrt((dx + dy) as F64)
    }
}

// Top-level execution (no main function required)
let origin = Point { x : 0, y : 0 };
let point = Point { x : 3, y : 4 };

let dist = point.distance();
// dist is proven to be a valid F64 at compile time
```

---

## Appendix B: Safety Proof Examples

### B.1 Division by Zero Prevention

```tuff
fn safeDivide(a : I32, b : I32) : Option<I32> => {
    if (b == 0) {
        None<I32>
    } else {
        // In this branch, compiler knows b != 0
        Some<I32> { value : a / b }
    }
}
```

### B.2 Array Bounds Prevention

```tuff
fn getElement(arr : *[I32], index : USize) : Option<I32> => {
    if (index < arr.length) {
        // In this branch, compiler knows index < arr.length
        Some<I32> { value : arr[index] }
    } else {
        None<I32>
    }
}
```

### B.3 Integer Overflow Prevention

```tuff
fn safeAdd(a : I32, b : I32) : Option<I32> => {
    // Compiler requires proof that a + b won't overflow
    // For now, we compute at a larger width
    let result : I64 = (a as I64) + (b as I64);
    if (result <= maxI32() && result >= minI32()) {
        Some<I32> { value : result as I32 }
    } else {
        None<I32>
    }
}
```

### B.4 Type Refinement Through Control Flow

```tuff
fn processValue(x : I32) => {
    if (x > 0 && x < 100) {
        // Here, compiler knows: x : I32 > 0 && x : I32 < 100
        // Which means: x : I32 where 0 < x < 100
        let refined : I32 < 100 = x;  // OK
        let positive : I32 > 0 = x;   // OK
    }
}
```

---

**End of Specification**
