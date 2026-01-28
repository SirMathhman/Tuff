# Tuff Language Specification (Draft)

This is an evolving specification of the Tuff language syntax and semantics. Features are organized by implementation priority.

## Core Guarantee: No Panics

**Tuff code is guaranteed to never panic or crash at runtime.** This is a fundamental language design goal, not an optional feature. The language prevents panics through:

- No `null` pointer dereferences (enforced via `Option<T>` types)
- No array out-of-bounds access (compile-time verified via refinement types)
- No arithmetic overflow/underflow panics (compile-time verified via refinement types)
- No invalid type casts (compile-time verified)
- No unwinding from failed assertions in release mode
- Explicit error handling via `Result<T>` or optional returns

This guarantee makes Tuff suitable for:
- Mission-critical systems that cannot tolerate crashes
- Long-running services that must be highly reliable
- Embedded and real-time systems
- Any application requiring predictable, crash-free execution

## Naming Conventions

Tuff follows the same naming conventions as C, Java, and TypeScript:

| Category | Convention | Examples |
|----------|-----------|----------|
| **Types** (struct, enum, trait, type alias) | `PascalCase` | `Point`, `Color`, `Result<T>`, `UserId` |
| **Functions** | `camelCase` | `add`, `greet`, `calculateTotal`, `parseInput` |
| **Variables** | `camelCase` | `x`, `myValue`, `currentIndex`, `tempName` |
| **Constants** | `UPPER_SNAKE_CASE` | `PI`, `MAX_SIZE`, `HTTP_TIMEOUT` |
| **Module/File names** | `snake_case` | `math.tuff`, `http_client.tuff`, `ui_helpers.tuff` |

Examples:

```tuff
struct PersonInfo {  // PascalCase for struct
  firstName: *Str    // camelCase for field (borrowed)
  lastName: *Str
}

enum NetworkStatus {  // PascalCase for enum
  Connected,
  Disconnected,
}

const MAX_RETRIES: I32 = 3  // UPPER_SNAKE_CASE for constant

fn calculateDistance(p1: Point, p2: Point) => F64 {  // camelCase for function
  let dx = p2.x - p1.x  // camelCase for variable
  let dy = p2.y - p1.y
  // ...
}

type Maybe<T> = Option<T>  // PascalCase for type alias
```

## Core Language Features

### Comments

```tuff
// Single-line comment

/* Multi-line
   comment */
```

### Primitive Types

Tuff includes the following primitive types:

| Type | Size | Range | Example |
|------|------|-------|---------|
| `U8` | 8-bit unsigned | 0 to 255 | `255_U8` |
| `I32` | 32-bit | -2^31 to 2^31-1 | `42_I32` |
| `I64` | 64-bit | -2^63 to 2^63-1 | `1000_I64` |
| `U32` | 32-bit unsigned | 0 to 2^32-1 | `42_U32` |
| `U64` | 64-bit unsigned | 0 to 2^64-1 | `1000_U64` |
| `USize` | pointer-sized unsigned | platform-dependent | `0_USize` |
| `F32` | 32-bit float | IEEE 754 single | `3.14_F32` |
| `F64` | 64-bit float | IEEE 754 double | `3.14` |
| `Bool` | 1-bit | `true` or `false` | `false` |
| `*Str` | UTF-8 slice | Variable | `"hello"` (borrowed string) |
| `String` | UTF-8 owned | Variable | Allocated string |
| `Void` | N/A | None | Implicit return |

### String Types: *Str vs String

Tuff distinguishes between **borrowed** and **owned** strings:

| Type | Use Case | Allocation | Lifetime |
|------|----------|-----------|----------|
| `*Str` | Function parameters, string slices | No (borrowed) | Caller owns memory |
| `String` | Return values, owned strings | Yes (heap allocated) | Type owns memory |

This is similar to Rust's `&str` vs `String`:

```tuff
let owned: String = "Hello, World!"  // Owned string allocated on heap

fn print_name(name: *Str) {          // Parameter takes borrowed reference
  print("Name: " + name)
}

let name: String = "Alice"
print_name(name)                      // name is not consumed (borrowed)

fn get_greeting() => String {        // Returns owned string
  "Hello"
}

let greeting = get_greeting()        // greeting owns the returned string
```

When passing strings to functions, use `*Str` for parameters. When storing or returning strings, use `String`.

### Variables

Variables are declared with `let` (immutable) or `let mut` (mutable):

```tuff
let x: I32 = 42
let mut y = 0  // Type inferred as I32
y = 1
```

### Constants

Constants use `const` and must have explicit types:

```tuff
const PI: F64 = 3.14159
```

### Functions

Functions are declared with `fn`:

```tuff
fn add(a: I32, b: I32) => I32 {
  a + b
}

fn greet(name: *Str) {
  // Implicit return of Void
  print("Hello, " + name)
}

// Expression-bodied functions
fn get() => 100
```

Lambdas use the same arrow syntax:

```tuff
let f: () => I32 = () => 100
```

Functions can have default parameters and optional returns. Optional returns (using `Option<T>`) are the primary error handling mechanism:

```tuff
fn power(base: I32, exp: I32 = 2) => I32 {
  // ...
}

fn maybeDivide(a: I32, b: I32) => Option<I32> {
  if b == 0 {
    None  // Represents division failure
  } else {
    Some(a / b)
  }
}

// Caller must handle the optional return
let result = maybeDivide(10, 2)
match (result) {
  case Some(value) => print("Result: " + string(value)),
  case None => print("Division failed"),
}
```

### Option Types

`Option<T>` represents either a value (`Some<T>`) or the absence of a value (`None<T>`).

One way to model it is:

```tuff
struct Some<T> { value: T }
object None<T> { }

type Option<T> = Some<T> | None<T>
```

You can narrow and destructure using `is`:

```tuff
let value: Option<I32> = getOption<I32>()
if (value is Some<I32> { value: destructuredValue }) {
  print("Got: " + string(destructuredValue))
} else {
  print("No value")
}
```

### Structs

Structs group related data:

```tuff
struct Point {
  x: F64
  y: F64
}

struct Person {
  pub name: String  // Public field (owned)
  age: I32          // Private field
}

// Construction
let p = Point { x: 1.0, y: 2.0 }
let person = Person { name: "Alice", age: 30 }
```

### Enums

Enums define a set of variants:

```tuff
enum Color {
  Red,
  Green,
  Blue,
}
```

### Pattern Matching

Match expressions provide exhaustive pattern matching with parenthesized values and `case` keywords:

```tuff
match (value) {
  case 0 => "zero",
  case 1 | 2 => "small",
  case 3..10 => "medium",
  case _ => "other",
}

// With bindings
match (result) {
  case Result::Ok(value) => print("Success: " + value),
  case Result::Err(msg) => print("Error: " + msg),
}
```

### Type Aliases

```tuff
type UserId = U64
type Handler = fn(*Str) => Void
type Maybe<T> = Option<T>
```

### Generics

Functions and types support generic parameters:

```tuff
fn identity<T>(value: T) => T {
  value
}

struct Container<T> {
  item: T
}
```

### Traits

Traits define shared behavior:

```tuff
trait Drawable {
  fn draw() => Void
}

struct Circle {
  radius: F64
}

impl Drawable for Circle {
  fn draw() => Void {
    print("Drawing circle with radius " + string(radius))  // string() converts to String
  }
}

```

### Contracts

Contracts define required behavior via method signatures. They enable both **static (compile-time)** and **dynamic (runtime) dispatch**, similar to interfaces in Java or traits in Rust.

#### Contract Definition

```tuff
contract Vehicle {
  fn goto() => Void
}

contract Sized {
  fn size() => USize
}
```

#### Static Implementation (Compile-Time Dispatch)

Use `with Contract` syntax to statically implement a contract. The compiler inlines implementations, incurring no runtime overhead:

```tuff
fn Car(model: *Str) => Car {
  out fn goto() => {
    print("Car " + model + " driving")
  }

  with Vehicle
}

let car = Car("Toyota")
car.goto()  // ✓ Compiles; calls Car::goto directly (static dispatch)
```

#### Dynamic Implementation (Runtime Dispatch via VTables)

When you assign a concrete type to a contract-typed variable, the compiler **implicitly** generates a vtable and wraps the value:

```tuff
let vehicle: Vehicle = car

// Desugars to:
let vehicle: Vehicle = car.intoVehicle(car, allocator)
```

The desugaring is:

```tuff
implicit fn intoVehicle<T>(
  this: T,
  allocator: <U>(*U) => (*U then drop)
) => Vehicle => {
  let ref: (*T then drop) = allocator(&this)
  
  // Vehicle is a fat pointer: {ref, vtable}
  Vehicle {
    ref: ref,
    VTable { goto: |()| => T::goto(ref) }
  }
}
```

The contract type itself becomes a fat pointer holding:
- A type-erased pointer to the concrete value (`ref: *T`)
- A virtual method table (vtable) with function pointers for each method

Calling methods on `vehicle: Vehicle` uses the vtable:

```tuff
vehicle.goto()  // Calls vtable.goto(vehicle.ref)
```

#### Generic Bounds on Contracts

You can constrain type parameters to any concrete type that implements a contract:

```tuff
fn operate<T: Vehicle>(v: T) => Void {
  v.goto()  // Static dispatch; T has goto
}

let car = Car("Honda")
operate(car)  // ✓ OK; Car implements Vehicle

let vehicle: Vehicle = car
operate(vehicle)  // ✓ OK; Vehicle is subtype of Vehicle
```

When you pass a contract-typed value to a generic expecting a `T: Vehicle`, it's dynamically dispatched (the vtable call happens, then the generic receives the result).

#### Multiple Contracts and Subtyping

A type can implement multiple contracts:

```tuff
contract Drivable {
  fn drive() => Void
}

contract Maintainable {
  fn repair() => Void
}

fn Truck(model: *Str) => Truck {
  out fn drive() => { print("Truck driving") }
  out fn repair() => { print("Truck repaired") }

  with Drivable
  with Maintainable
}
```

Contracts are **subtypes** of each other if one is implemented in terms of the other (or manually declared); the compiler determines subtyping relationships.

#### Refinement Types in Contracts

Contracts can use refinements to codify safety requirements:

```tuff
contract List<T> {
  fn size() => USize
  fn get(index: USize < this.size()) => T
  fn set(index: USize < this.size(), value: T) => Void
}
```

When calling `list.get(idx)`, the compiler requires proof that `idx < list.size()` before the call succeeds (static dispatch) or defers to runtime checks (dynamic dispatch on contract-typed values).

#### Object Singletons vs Contract Implementations

**Objects** are singletons (one instance per type parameter); **contracts** are abstractions (many implementations). They are orthogonal concepts:

```tuff
// A contract
contract Logger {
  fn log(msg: *Str) => Void
}

// An object (singleton)
out object ConsoleLogger {
  out fn log(msg: *Str) => {
    print(msg)
  }

  with Logger
}

// A struct with contract
struct FileLogger {
  path: *Str
}

impl Logger for FileLogger {
  fn log(msg: *Str) => {
    // Write to file
  }
}
```

### Objects (Singletons)

**Objects** are singletons: the runtime guarantees exactly one instance per type-parameter instantiation. They are fully initialized before any code can access them.

The `out` keyword marks items as exported/public:

```tuff
out object MySingleton {
  let mut counter = 0

  out fn add() => {
    counter += 1
  }
}

MySingleton.add()  // Accesses the global singleton
```

#### Generic Objects

If an object is generic, a distinct singleton exists for each type instantiation:

```tuff
object None<T> { }

// These are different singletons
assert &None<I32> != &None<*Str>      // Different instances
assert &None<I32> == &None<I32>       // Same instance each call
```

#### Dependency Injection Pattern

Objects can declare injected dependencies using `in`:

```tuff
out object MyController {
  in let myService: UserService

  out fn handleRequest() => Result<Response, Error> {
    match (myService.getUsers()) {
      case Ok<[User]> { value: users } => {
        Ok<Response> { value: Response::fromUsers(users) }
      }
      case Err<Error> { error: e } => {
        Err<Error> { error: e }
      }
    }
  }
}
```

The `in` dependencies are injected at initialization time. The compiler ensures all injected types are available before the object initializes.

#### Objects Implementing Contracts

Objects can implement contracts, making them suitable as dependencies:

```tuff
contract UserService {
  fn getUsers() => Result<[User], Error>
}

out object DefaultUserService {
  out fn getUsers() => Result<[User], Error> {
    // Fetch from database
  }

  with UserService
}

// DI wires it up:
out object MyApp {
  in let service: UserService

  out fn start() => Void {
    match (service.getUsers()) {
      // ...
    }
  }
}
```
```

### Access Control

Items can be marked `pub` for public visibility, otherwise private:

```tuff
pub struct PublicStruct { }
pub fn public_function() { }

fn private_function() { }
```

### Type Casting

Explicit type conversion with `as`:

```tuff
let x = 42_I32
let y = x as F64  // 42.0_F64
```

### Destructors (Planned)

Types may define a destructor by implementing `drop`. Destructors run when a value goes out of scope (or is otherwise dropped).

```tuff
fn drop(temp: MyType) => {
  // ... cleanup
}

type MyType = I32

let value: MyType = 100
// value is dropped at end of scope
```

### Refinement Types

Refinement types encode constraints on values at the type level to prevent runtime panics.

A refinement type is written by attaching one or more predicates to a base type, for example:

- `USize < this.size()`
- `I32 > 0 & I32 < 100`

Use `&` as an intersection operator to combine multiple constraints.

Predicates may reference:
- The value being constrained (by name, e.g. `idx: USize < len(arr)`)
- The receiver (`this`) inside contracts/traits (e.g. `USize < this.size()`)

For readability, predicates on non-scalar types are often written with `where`:

```tuff
fn first<T>(arr: T[] where len(arr) > 0) => T { ... }
```

#### Type Narrowing with Control Flow

When you use conditionals, the compiler tracks refinements within each branch:

```tuff
let x: I32 = read<I32>()
if (x > 100) {
  // Within this block, x is provably I32 > 100
  let a = x - 50  // Safe, result is > 50
} else if (x > 50) {
  // Within this block, x is provably I32 > 50 & I32 <= 100
  let b = x / 2   // Safe
} else {
  // Within this block, x is provably I32 <= 50
  let c = -x      // Safe for negation
}
// After the if/else, x is still typed as I32 (refinement is local to branches)
```

#### Array Access with Refinements

Refinement types prevent out-of-bounds array access at compile time by requiring proof that the index is valid:

```tuff
contract List<T> {
  fn size() => USize
  fn get(index: USize < this.size()) => T
  fn set(index: USize < this.size(), value: T) => Void
  fn remove(index: USize < this.size()) => T
}
```

Example usage:

```tuff
let arr = [1, 2, 3]
let x = arr.get(0)              // ✓ OK: literal 0 is provably < 3
let i: USize = 1
let y = arr.get(i)              // ✓ OK: after bounds check
let j: USize = getUserInput()
let z = arr.get(j)              // ✗ Error: no proof that j < arr.size()

// Must use conditional to provide proof:
if (j < arr.size()) {
  let z = arr.get(j)            // ✓ OK: bounds check provides proof
}
```

#### Partially Initialized Arrays

Array types track initialization state with the syntax `[T; Init; Length]`:
- `T`: element type
- `Init`: number of initialized elements (0-indexed)
- `Length`: total capacity

Elements must be initialized in order:

```tuff
let mut arr: [I32; 0; 3]        // 0 initialized, capacity 3
arr[0] = 100                     // ✓ OK: initializing next element
arr[1] = 200                     // ✓ OK: continuing in order
arr[2] = 300                     // ✓ OK: now fully initialized

let mut arr2: [I32; 0; 3]
arr2[1] = 100                    // ✗ Error: must initialize arr2[0] first
```

This ordering guarantee ensures that at any point, elements `0..Init` are all valid and safe for iteration.

#### Pattern Matching with Refinements

Match expressions (with parenthesized value) can narrow types within each case:

```tuff
match (score) {
  case 0..50 => {
    // score: I32 >= 0 & I32 <= 50
    print("Fail")
  }
  case 51..100 => {
    // score: I32 > 50 & I32 <= 100
    print("Pass")
  }
  case _ => {
    // score: I32 < 0 | I32 > 100
    print("Excellent")
  }
}
```

#### Other Common Refinements

```tuff
// Positive numbers
fn divide(a: I32, b: I32 > 0) => I32 {
  a / b
}

// Non-empty collections
fn first<T>(arr: T[] where len(arr) > 0) => T {
  arr[0]
}

// Intersection of constraints
fn gradePercentage(p: I32 > 0 & I32 < 100) => *Str {
  if p >= 90 { "A" }
  else if p >= 80 { "B" }
  // ...
}

// Type aliases for complex refinements
type PercentageScore = I32 > 0 & I32 < 100
type ValidIndex<N> = USize < N

fn safeScore(score: PercentageScore) => Void {
  print("Valid score: " + string(score))
}
```

#### Refinements in Trait Bounds

Refinements can constrain generic type parameters:

```tuff
fn minSafe<T: I32 > 0>(a: T, b: T) => T {
  if a < b { a } else { b }
}
```

Stack arrays can use refinement type parameters for bounds:

```tuff
fn safeIndex<T, L: USize>(
  arr: [T; _; L],
  idx: USize < L
) => T {
  arr[idx]
}
```

#### Arithmetic Overflow Prevention

Refinement types prevent arithmetic overflow by constraining operands. For example, with `U8` (range 0-255), adding two values requires proof of no overflow.

`Max<T>` is a compile-time constant that evaluates to the maximum value representable by integer type `T` (e.g. `Max<U8> == 255`).

```tuff
// Invalid: x + y could overflow U8
let x: U8 = read<U8>()
let y: U8 = read<U8>()
let z = x + y  // ✗ Error: no proof that x + y <= 255

// Valid: explicitly prove the sum won't overflow
let x: U8 = read<U8>()
let y: U8 = read<U8>()
let z = if (x <= Max<U8> - y) x + y else 0  // ✓ OK: constraint x + y <= Max<U8> is satisfied
```

Similar refinement constraints apply to other operations:
- **Subtraction**: `a - b` requires `a >= b` on unsigned integers
- **Multiplication**: `a * b` requires `a * b <= Max<T>`
- **Division**: `a / b` requires `b != 0`

By encoding these constraints, **Tuff guarantees that no arithmetic operation will panic, overflow, or produce undefined behavior at runtime**.

## Expressions

Blocks can be expressions. The value of a block is the value of its last expression:

```tuff
let x = {
  let y = 100
  y
}
```

### Binary Operators

```tuff
// Arithmetic
a + b, a - b, a * b, a / b, a % b

// Comparison
a == b, a != b, a < b, a <= b, a > b, a >= b

// Logical
a && b, a || b

// Bitwise
a & b, a | b, a ^ b, a << b, a >> b
```

### Unary Operators

```tuff
-value     // Negation
!value     // Logical NOT (Bool)
```

### Array Access and Member Access

```tuff
items[0]           // Array indexing
point.x            // Struct field access
container.first()  // Method call
```

Array indexing requires a proof that the index is in bounds (via refinement types); otherwise it is a compile-time error.

### Closures and Function Pointers (Planned)

Closure types use arrow syntax:

- `() => R` is a closure type.
- `*() => R` is a function-pointer type (no captured environment).

Closures can have different capture modes (inspired by Rust):

- `(*) => R` is like Rust `Fn` (captures by shared reference)
- `(*mut) => R` is like Rust `FnMut` (captures by mutable reference)
- `() => R` is like Rust `FnOnce` (captures by move/consume)

Captures are declared in square brackets:

```tuff
let socket = createSocket()

// Capture by move
fn byMove[socket]() => { }

// Capture by shared reference
fn byRef[&socket]() => { }

// Capture by mutable reference
fn byMut[&mut socket]() => { }
```

#### Methods, `this`, and Method Pointers (Planned)

Methods may implicitly capture `this`.

```tuff
fn Point(x: I32, y: I32) => {
  fn manhattan() => x + y  // Implicit &this
  this
}

let point = Point(3, 4)

let manhattanPtr: *(*Point) => I32 = Point::manhattan
let manhattanClosure: (*) => I32 = point.manhattan

// Syntactic sugar
manhattanPtr(&point)
point.manhattan()
```

### Conditionals

```tuff
if condition {
  // ...
} else if other {
  // ...
} else {
  // ...
}

// Conditional expression
let result = if condition { "yes" } else { "no" }
```

### Loops

```tuff
// While loop
while condition {
  // ...
}

// For loop
for i in 0..10 {
  print(i)
}

// Infinite loop
loop {
  if should_break {
    break
  }
}
```

## Standard Library (Planned)

Common functions will be available in the standard library:

```tuff
// Printing
print(value: *Str) => Void
println(value: *Str) => Void

// Type conversion
string(value: any) => String  // Converts any type to owned String
number(value: *Str) => Option<I32>

// Collections
len(array: T[]) => USize
push<T>(mut array: T[], item: T) => Void
pop<T>(mut array: T[]) => Option<T>
```

## Module System (Planned)

Import and use modules:

```tuff
use std::io
use { Vector, HashMap } from collections
use math as m

fn main() {
  let v = m::sqrt(16.0)
}
```

### Modules vs Objects

Modules group declarations, but they cannot hold runtime state or perform stateful operations. If you need state or side effects, use an `object` instead.

```tuff
module MyModule {
  // Compile-time constant
  out let myConstant = 1

  // Pure function (no captured environment)
  out fn get() => 100
}

let pointer: *() => I32 = MyModule::get
```

## Error Handling

Tuff enforces a no-panic policy through explicit error handling patterns:

### Optional Types (`Option<T>`)
Used when an operation may fail with no additional error information:

```tuff
fn parseInt(s: *Str) => Option<I32> {
  // Returns None if parsing fails, Some(value) otherwise
}
```

### Result Types (Planned)

Used to return either a value or detailed error information. `Result<T, X>` represents either success (`Ok<T>`) or failure (`Err<X>`):

```tuff
struct Ok<T> { value: T }
struct Err<X> { error: X }

type Result<T, X> = Ok<T> | Err<X>
```

You can narrow and destructure using `is`:

```tuff
fn readFile(path: *Str) => Result<String, *Str> {
  // Returns Ok(contents) or Err(error_message)
}

let result = readFile(path)
if (result is Ok<String> { value: contents }) {
  print("File: " + contents)
} else if (result is Err<*Str> { error: msg }) {
  print("Error: " + msg)
}
```

### The `?` Operator (Planned)
Propagates errors up the call stack safely:

```tuff
fn processFile(path: *Str) => Result<I32> {
  let contents = readFile(path)?     // Unwrap or propagate error
  let count = countLines(contents)?
  Ok(count)
}

// Alternative with explicit pattern matching:
fn processFileAlt(path: *Str) => Result<I32> {
  match (readFile(path)) {
    case Ok(contents) => {
      match (countLines(contents)) {
        case Ok(count) => Ok(count),
        case Err(e) => Err(e),
      }
    },
    case Err(e) => Err(e),
  }
}
```

This ensures errors are always handled explicitly rather than causing panics.

## Planned Features

- Ownership and borrowing system
- Lifetime annotations
- Closures and higher-order functions
- Result type with `?` operator for richer error handling
- Decorators/attributes
- Macros
- Async/await (future)
- SIMD support (future)

## Differences from Inspiration Languages

### vs. Rust
- Less strict ownership (closer to TypeScript defaults)
- No implicit nulls; explicit `Option<T>`
- Simpler trait system (no variance, fewer rules)
- **Same guarantee**: Both provide crash-free execution by design

### vs. TypeScript
- Explicit types (less inference, more clarity)
- Performance-oriented (compile to native, not JS)
- **Better reliability**: No panics or uncaught exceptions at runtime
- Stricter null safety (no accidental nulls)

### vs. Kotlin
- Compilation to native code, not JVM
- More focus on performance/systems programming
- Stricter null safety options
- **Native guarantee**: No reliance on JVM error handling

## Type Inference Limitations

Tuff uses **limited type inference**:

- Function parameters always require explicit types
- Return types are inferred from function body
- Variable types can be inferred in assignments
- Generic type arguments may need explicit specification

```tuff
// ✓ OK - return type inferred from expressions
fn double(x: I32) {
  x * 2
}

// ✗ Error - parameter type required
fn triple(x) {
  x * 3
}

// ✓ OK - type inferred from assignment
let nums = [1, 2, 3]  // inferred as I32[]
```
