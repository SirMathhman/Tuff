# Tuff Language Specification

## 1. Purpose and Scope

Tuff is a systems programming language designed with one fundamental principle: **zero undefined behavior and zero panics**. Every operation has defined behavior, every error is recoverable, and the language is safe even for AI-generated code and bare metal environments.

Tuff combines:

- **Rust-inspired** ownership and borrowing for memory safety
- **TypeScript/Kotlin-inspired** type inference and developer ergonomics
- **Refinement types** for compile-time range proofs
- **Continuation-passing async** for bare-metal-compatible concurrency
- **C-level interoperability** as a first-class requirement

### Primary Stakeholders

- Systems programmers who want safety without escape hatches
- Embedded/bare metal developers who need guaranteed behavior
- AI-assisted coding workflows that demand predictable outputs
- Teams porting C codebases to a safer alternative

### Success Criteria

- No undefined behavior in any valid Tuff program
- No panic mechanism — all errors are recoverable
- Seamless C FFI — call any C library without wrappers
- Compile to C (initially) and LLVM (eventually)
- Learnable by developers familiar with Rust, TypeScript, or Kotlin

---

## 2. Domain Model

### 2.1 Core Concepts

| Concept          | Description                                                    |
| ---------------- | -------------------------------------------------------------- |
| Ownership        | Each value has exactly one owner; references are borrowed      |
| Lifetimes        | Compile-time guarantee that references outlive their referents |
| Contracts        | Named sets of method signatures, fields, and generic bounds    |
| Refinement Types | Compile-time range proofs on numeric types                     |
| Null Type        | First-class `Null` type, distinct from `0` and pointers        |
| Result Types     | All errors return `Result<T, E>` or `Option<T>` — never panic  |
| Continuations    | Async/await compiled to continuation-passing form              |

### 2.2 Type System Hierarchy

```
Type
├── Primitive Types
│   ├── Bool
│   ├── Char
│   ├── String
│   └── Numeric Types (with refinement)
│       ├── I32 >= min && I32 <= max   (signed, range-constrained)
│       ├── U32 >= 0 && U32 < 256       (unsigned, range-constrained)
│       └── F64                          (IEEE 754, no overflow panic)
├── Compound Types
│   ├── Struct
│   ├── Enum (with associated data — algebraic data types)
│   ├── Tuple
│   └── Array<T, N>          (fixed-size, stack-allocated)
├── Reference Types
│   ├── &T                   (immutable borrow)
│   ├── &mut T               (mutable borrow)
│   └── &T | Null            (nullable pointer, union type)
├── Function Types
│   ├── fn() -> T
│   ├── fn(A) -> T
│   └── Closure<T>           (with capture mode: move, borrow, mut)
├── Generic Types
│   ├── Vec<T>
│   ├── Map<K, V>
│   ├── Set<T>
│   ├── Result<T, E>
│   └── Option<T>
└── Special Types
    ├── Null                  (own type, not equal to 0)
    ├── Contract<T>           (trait/interface bound)
    └── Refinement<T, P>     (type with predicate P)
```

### 2.3 State Transitions

**Ownership Lifecycle:**

```
Created → Owned → (Borrowed & / &mut) → Dropped
                 → Moved → New Owner → ... → Dropped
```

**Key Rules:**

- A value can have exactly one owner at a time
- Immutable borrows (`&T`) can coexist with each other
- Mutable borrow (`&mut T`) requires exclusive access
- References cannot outlive their owner (enforced by lifetimes)
- No raw pointers — all pointers are typed and bounds-checked

---

## 3. Functional Requirements

### 3.1 Syntax Overview

Tuff is an **expression-oriented** language with C/Rust-like curly-brace syntax. Semicolons are **required** to terminate statements. Whitespace is **not** significant — braces delimit blocks.

#### Comments

```tuff
// Single-line comment
/* Multi-line
   block comment */
```

#### Variable Declarations

```tuff
let x = 42;              // Immutable binding
let mut y = 10;          // Mutable binding
let z : I32 = 42;        // Explicit type annotation
```

#### Type Aliases

```tuff
type Percentage = I32 >= 0 && I32 <= 100;
type NullablePtr<T> = &T | Null;
```

#### Numeric Literals

```tuff
42;           // Decimal
0xFF;         // Hexadecimal
0b1010;       // Binary
0o77;         // Octal
42U32;        // Type suffix
1_000_000U64; // Underscore separators with type
```

#### String Literals

```tuff
"Hello, World!";      // Double-quoted string
'X';                   // Character literal
```

#### Operators

```tuff
// Arithmetic
let sum = a + b;
let diff = a - b;
let prod = a * b;
let quot = a / b;
let rem = a % b;

// Comparison
let eq = a == b;
let ne = a != b;
let lt = a < b;
let gt = a > b;
let le = a <= b;
let ge = a >= b;

// Logical
let both = a && b;
let either = a || b;
let notA = !a;

// Bitwise
let andBits = a & b;
let orBits = a | b;
let xorBits = a ^ b;
let shifted = a << 2;
let rightShifted = a >> 1;

// Compound assignment
x += 1;
x -= 1;
x *= 2;
// etc.
```

**No operator overloading** — operators work only on built-in types.

#### Ternary Expression

```tuff
let msg = if (count == 0) then "empty" else "has items";
```

#### Implicit Return

The last expression in a block is implicitly returned:

```tuff
fn square(x : I32) : I32 => x * x;

fn classify(n : I32) : String => {
    if (n > 0) then "positive" else "negative"  // Implicit return
}
```

#### Semicolons

Semicolons are **required** after statements:

```tuff
let x = 5;
let y = 10;
let sum = x + y;
```

---

### 3.2 Functions

Functions use `:` for type annotations and `=>` is **required** for all function definitions — both short and multi-line:

```tuff
// Multi-line function (=> required)
fn add(first : I32, second : I32) : I32 => {
    let result = first + second;
    return result;
}

// Single-expression function
fn multiply(a : I32, b : I32) : I32 => a * b;

// No return type (returns Void)
fn printHello() : Void => {
    println("Hello!");
}

// Generic function
fn first<T>(items : Vec<T>) : Option<T> => {
    if (items.len() > 0) then Some(items[0]) else None
}
```

#### Method Calls

```tuff
obj.method();
vec.push(42);
string.len();
```

---

### 3.3 Structs

```tuff
struct Point {
    x: F64,
    y: F64,
}

struct Rectangle {
    topLeft: Point,
    bottomRight: Point,
}

// Construction
let p = Point { x: 0.0, y: 0.0 };
let r = Rectangle { topLeft: p, bottomRight: Point { x: 1.0, y: 1.0 } };

// Field access
let x = p.x;  // Auto-deref works through references
```

---

### 3.4 Unions (Algebraic Data Types)

Tuff uses union types defined as type aliases of `|`-separated types. Unions can hold **any type** — structs, primitives, arrays, Null, etc.

```tuff
// Define variant structs
struct IntValue { value: I32 }
struct StrValue { text: String }
struct Empty {}

// Union type
type MyUnion = IntValue | StrValue | Empty | Null;

// Construction
let something : MyUnion = IntValue { value: 42 };
let another : MyUnion = StrValue { text: "hello" };
let nothing : MyUnion = Empty {};
let nullVal : MyUnion = Null;

// Pattern matching
match (something) {
    case v : IntValue => println("Int: " + v.value.toString());
    case v : StrValue => println("Str: " + v.text);
    case Empty => println("Empty");
    case Null => println("Null");
}

// Destructuring in patterns
match (value) {
    case { value } : IntValue => println("Value: " + value.toString());
    case { text } : StrValue => println("Text: " + text);
    case _ => println("Other");
}
```

---

### 3.5 Control Flow

All conditions require **parentheses**.

```tuff
// If/else (expression — returns a value)
let msg = if (count > 0) {
    "has items"
} else {
    "empty"
};

// Ternary (shorthand)
let sign = if (n >= 0) then "positive" else "negative";

// Match (exhaustive pattern matching)
match (result) {
    case v : Ok => {
        println("Success: " + v.data);
    };
    case e : Err => {
        println("Error: " + e.message);
    };
}

// While loop
while (condition) {
    // ...
};

// For loop with range
for (i in 0..10) {
    println(i.toString());
};

// For-in (iterator)
for (item in collection) {
    process(item);
};

// Labeled loops
outer: for (x in items) {
    for (y in items) {
        if (x == y) {
            break outer;
        }
    }
};

// No goto — structured control flow only
```

### 3.6 Ownership and Borrowing

```tuff
// Ownership transfer
fn takeOwnership(value : Vec<I32>) : I32 => {
    let len = value.len();  // borrow
    return len;             // value dropped at end
}

// Borrowing
fn firstElement(items : &Vec<I32>) : &I32 => {
    return &items[0];  // returns borrow of element
}

// Mutable borrow
fn appendItem(items : &mut Vec<I32>, item : I32) : Void => {
    items.push(item);  // mutates through borrow
}

// Dereferencing
let val = *ptr;           // Explicit deref
let field = ptr.field;    // Auto-deref for field access
```

### 3.7 Lifetimes

Tuff supports both **explicit** and **inferred** lifetimes:

```tuff
// Inferred lifetime (compiler determines)
fn longest(a : &String, b : &String) : &String => {
    if (a.len() >= b.len()) {
        return a;
    } else {
        return b;
    }
}

// Explicit lifetime annotation
fn longestExplicit<'a>(a : &'a String, b : &'a String) : &'a String => {
    if (a.len() >= b.len()) {
        return a;
    } else {
        return b;
    }
}
```

### 3.8 Contracts

The `contract` keyword defines method signatures, fields, and generic bounds:

```tuff
// Basic contract
contract Serializable {
    fn serialize() : String;
    fn deserialize(data : String) : Result<Self, Error>;
}

// Contract with fields
contract Resource {
    id: U32 >= 0;
    fn open() : Result<Self, Error>;
    fn close() : Result<Void, Error>;
}

// Contract with generic bounds
contract Container<T : Clone> {
    fn insert(item : T) : Result<Void, Error>;
    fn remove(index : U32 >= 0) : Result<T, Error>;
    fn len() : U32 >= 0;
}

// Implementing a contract
struct MyList<T : Clone> {
    items: Vec<T>,
}

impl Container<I32> for MyList<I32> {
    fn insert(item : I32) : Result<Void, Error> {
        self.items.push(item);
        return Ok(());
    }
}
```

### 3.9 Generics

Generics use angle brackets `<T>` and monomorphization (code duplicated per type):

```tuff
fn max<T : Ord>(a : T, b : T) : T => {
    if (a >= b) {
        return a;
    } else {
        return b;
    }
}

// Usage
let n = max(3, 5);        // T = I32
let s = max("a", "b");    // T = String
```

### 3.10 Refinement Types

Compile-time range proofs eliminate integer overflow using predicate-based syntax:

```tuff
// Range-constrained types with explicit predicates
type Percentage = I32 >= 0 && I32 <= 100;
type Port = U16 >= 0 && U16 <= 65535;
type Index = U32 >= 0;

fn setPercentage(val : Percentage) : Void => {
    // Compiler proves val >= 0 && val <= 100
    self.pct = val;
}

// Arithmetic with refinement
fn addSafe(a : I32 >= 0 && I32 <= 100, b : I32 >= 0 && I32 <= 100) : Result<I32 >= 0 && I32 <= 100, Overflow> => {
    let sum = a + b;  // Compiler inserts range check
    if (sum >= 0 && sum <= 100) {
        return Ok(sum);
    } else {
        return Err(Overflow);
    }
}

// More complex predicates
type PositiveOdd = I32 > 0 && I32 % 2 != 0;
type EmailLength = U32 >= 1 && U32 <= 254;
```

### 3.11 Null Safety

`Null` is a first-class type, not equal to `0`:

```tuff
// Nullable pointer as union
type NullablePtr<T> = &T | Null;

fn process(node : NullablePtr<TreeNode>) : String => {
    match (node) {
        case n : &TreeNode => n.value.toString();
        case Null => "empty";
    }
}

// Null is its own type
let nothing : Null = Null;
// nothing != 0  // compile error: types differ
```

### 3.12 Error Handling

All errors are recoverable — there is no panic. The `?` operator propagates errors:

```tuff
// Result type for fallible operations
fn divide(a : F64, b : F64) : Result<F64, DivByZero> => {
    if (b == 0.0) {
        return Err(DivByZero);
    }
    return Ok(a / b);
}

// Caller must handle
fn calculate() : Result<F64, Error> => {
    let result = divide(10.0, 0.0)?;  // Propagate error
    return Ok(result);
}

// Option for missing values
fn findKey(map : Map<String, I32>, key : String) : Option<I32> => {
    if (map.contains(key)) {
        return Some(map[key]);
    }
    return None;
}
```

### 3.13 Async/Await

Continuation-passing form enables async even on bare metal:

```tuff
// Async function
async fn fetchUrl(url : String) : Result<String, NetworkError> => {
    let response = await httpGet(url);
    return Ok(response.body);
}

// Usage
async fn main() : Result<Void, Error> => {
    let data = await fetchUrl("https://example.com");
    println(data);
    return Ok(());
}

// Compiled to continuation-passing:
// fetchUrl(url, fn(result) { ... })
```

### 3.13 Concurrency

Thread safety enforced by ownership:

```tuff
// Send-safe data (owned transfer between threads)
fn spawnTask(data : Vec<I32>) : Thread => {
    return Thread::spawn(move || {
        process(data);  // data moved into thread
    });
}

// Shared state with synchronization
struct Counter {
    value: AtomicI32,
}

fn increment(counter : &Counter) : Void => {
    counter.value.fetch_add(1);  // atomic, no data race
}
```

### 3.14 C Interoperability

Seamless C FFI is critical:

```tuff
// Import C functions
extern "C" {
    fn malloc(size : UInt) : *Void;
    fn free(ptr : *Void) : Void;
    fn printf(format : *Char, ...) : Int;
}

// Call C libraries directly
fn allocateBuffer(size : UInt) : *U8 => {
    let ptr = malloc(size) as *U8;
    return ptr;
}

// Export to C
#[exportC]
fn myFunction(x : I32, y : I32) : I32 => {
    return x + y;
}
```

### 3.12 Control Flow

```tuff
// If/else (parentheses required)
if (condition) {
    // ...
} else {
    // ...
}

// Match (exhaustive)
match (value) {
    Pattern1 => { /* ... */ },
    Pattern2 => { /* ... */ },
    // Compiler ensures all cases covered
}

// While loop
while (condition) {
    // ...
}

// For loop with range
for (i in 0..10) {
    // ...
}

// For-in (iterator)
for (item in collection) {
    // ...
}

// Labeled loops
outer: for (x in items) {
    for (y in items) {
        if (x == y) {
            break outer  // break to outer loop
        }
    }
}

// No goto — structured control flow only
```

### 3.15 Closures

Rust-style capture modes:

```tuff
// Borrow capture (default)
let multiplier = |x : I32| : I32 => x * factor;  // borrows factor

// Move capture
let ownedClosure = move |x : I32| : I32 => x * ownedData;

// Mutable capture
let mut counter = 0;
let increment = || : Void => counter += 1;  // mutates capture
```

### 3.16 Module System

File path determines module path (no explicit module declarations):

```tuff
// File: myPackage/math/utils.tuff
// Module path: myPackage::math::utils

out fn add(a : I32, b : I32) : I32 => {
    return a + b;
}

// In another file:
in myPackage::math::utils::add;
```

The `in` keyword imports (like dependency injection), and `out` marks public exports.

---

## 4. Edge Cases and Error Handling

### 4.1 Undefined Behaviors Eliminated

| Behavior                 | Tuff's Approach                           |
| ------------------------ | ----------------------------------------- |
| Integer overflow         | Refinement types + Result return          |
| Division by zero         | Returns `Result<T, DivByZero>`            |
| Use-after-free           | Ownership system prevents at compile time |
| Data races               | Ownership + `Send`/`Sync` contracts       |
| Null pointer dereference | `Null` type + exhaustive pattern matching |
| Buffer overflow          | Bounds-checked arrays and slices          |
| Unaligned access         | Compiler enforces alignment               |
| Uninitialized memory     | All variables must be initialized         |
| Signed integer overflow  | Defined behavior via refinement           |
| Dangling references      | Lifetime system prevents                  |

### 4.2 Error Recovery in Bare Metal

In bare metal environments, the caller must handle all errors:

```tuff
// Entry point must return Result
fn main() : Result<Void, FatalError> => {
    // All errors propagated up
    // No panic, no crash
    return hardwareInit()?;
}

// The compiler enforces that all error paths are handled
// at the top level of the call graph
```

### 4.3 Division by Zero

```tuff
// Always returns Result, never crashes
let result : Result<F64, DivByZero> = 1.0 / 0.0;
match (result) {
    case v : Ok => println("Result: " + v.toString());
    case e : Err => println("Cannot divide by zero");
}
```

### 4.4 Array Bounds

```tuff
// Bounds checked, returns Result
fn getItem(arr : &Vec<I32>, index : I32) : Result<I32, IndexOutOfBounds> => {
    if (index >= 0 && index < arr.len()) {
        return Ok(arr[index]);
    }
    return Err(IndexOutOfBounds);
}
```

---

## 5. Non-Functional Requirements

### 5.1 Performance

- Zero-cost abstractions: generics monomorphize, inlining applied
- No hidden allocations: stack allocation by default, heap explicit
- Async has no runtime overhead on bare metal (continuation-passing)
- Bounds checks may be elided when refinement types prove safety

### 5.2 Compilation

- Initial target: C (compiled via GCC/Clang)
- Future target: LLVM IR (direct native code generation)
- Compile times: target < 1s for small modules, < 30s for large crates

### 5.3 Safety

- 100% of valid Tuff programs have defined behavior
- No `unsafe` keyword — no escape hatch
- Safe for AI-generated code: no edge cases that panic
- Safe for bare metal: no OS dependencies for core language

### 5.4 Interoperability

- Call any C function directly via `extern "C"`
- Export Tuff functions to C via `#[exportC]`
- Compatible with C ABI for structs and enums

### 5.5 Developer Experience

- Type inference reduces boilerplate
- Exhaustive pattern matching catches missing cases
- Refinement types catch range errors at compile time
- Clear error messages (Rust-quality diagnostics)

---

## 6. Data Requirements

### 6.1 Input Formats

- `.tuff` source files (UTF-8 encoded)
- C header files for FFI (`extern "C"` blocks)

### 6.2 Output Formats

- C source code (initial backend)
- LLVM IR (future backend)
- Native binaries (via C compiler or LLVM)

### 6.3 Standard Library Data Structures

- `Vec<T>` — growable heap-allocated vector
- `Map<K, V>` — hash map or tree map
- `Set<T>` — hash set or tree set
- `String` — UTF-8 encoded, immutable by default
- `Array<T, N>` — fixed-size, stack-allocated

---

## 7. External Dependencies

### 7.1 Compiler Dependencies

- GCC or Clang (for C backend)
- LLVM (future native backend)

### 7.2 Package Manager (Future)

Plugin-based dependency resolution supporting:

- GitHub Releases
- GitLab Packages
- Azure Artifacts
- Local directories
- Custom registries (plugin interface)

### 7.3 C Libraries

- libc (for I/O, memory, etc.)
- Any C library via FFI

---

## 8. Constraints and Assumptions

### 8.1 Technical Constraints

- Initial compiler generates C — limited by C's capabilities
- No garbage collection — ownership-based memory management only
- No runtime type information (RTTI) — compile-time type safety only
- No macros in v1 — language simplicity prioritized

### 8.2 Design Assumptions

- Developers familiar with Rust, C, or TypeScript
- Target platforms support C compilation
- Bare metal targets have minimal memory (KB range)
- AI-generated code is a primary use case

### 8.3 Business Assumptions

- Open-source distribution
- Community-driven standard library growth
- Gradual migration from C codebases is a key adoption path

---

## 9. Acceptance Criteria

A Tuff implementation is correct when:

1. **No Undefined Behavior**: Every valid Tuff program has fully defined behavior on all inputs
2. **No Panics**: The language runtime has no panic mechanism
3. **Memory Safety**: Compile-time ownership prevents use-after-free, double-free, data races
4. **Bounds Safety**: All array/slice accesses are bounds-checked
5. **Null Safety**: Null dereference is a compile-time error
6. **Overflow Safety**: Integer overflow returns Result or is proven impossible via refinement
7. **C FFI**: Can call and be called from C without wrapper generation
8. **Exhaustiveness**: Pattern matches must cover all cases (compile error otherwise)
9. **Lifetime Safety**: Dangling references are a compile-time error
10. **Bare Metal**: Core language features work without an OS

---

## 10. Open Questions

The following areas are acknowledged as TBD and require future decisions:

1. **Package Manager Design**: Specific plugin API for dependency resolution
2. **Tooling**: Formatter, linter, LSP server, REPL — not yet designed
3. **Macros**: No macro system in v1, but should one be added later?
4. **Contract Implementation Details**: How contracts relate to Rust traits vs Kotlin interfaces needs refinement
5. **Refinement Type Solver**: What logic engine powers compile-time range proofs? (SMT solver? Custom?)
6. **Memory Allocator**: Default allocator strategy for heap allocations
7. **Concurrency Primitives**: Beyond threads — channels? mutexes? rwlocks?
8. **Testing Framework**: Built-in test structure and assertions
9. **Documentation Format**: Doc comment syntax and generator
10. **Build System**: How projects are structured and compiled

---

## Appendix A: Language Comparison

| Feature            | Tuff                 | Rust             | C            | Kotlin     | TypeScript  |
| ------------------ | -------------------- | ---------------- | ------------ | ---------- | ----------- |
| Undefined Behavior | None                 | Some (unsafe)    | Extensive    | None       | None        |
| Panics             | No                   | Yes              | N/A          | No         | No          |
| Memory Safety      | Ownership            | Ownership        | Manual       | GC         | GC          |
| Null Safety        | `Null` type          | `Option<T>`      | Raw pointers | `T?`       | `T \| null` |
| Integer Overflow   | Result/Refinement    | Wrapping/Panic   | UB           | Checked    | Checked     |
| Async              | Continuation-passing | Futures          | Callbacks    | Coroutines | Promises    |
| FFI                | C (native)           | C (unsafe)       | N/A          | Limited    | None        |
| Type Inference     | Yes                  | Limited          | No           | Yes        | Yes         |
| Generics           | Monomorphization     | Monomorphization | Macros       | Erased     | Erased      |

## Appendix B: Sample Program

```tuff
// File: main.tuff

in std::io;
in std::collections::Vec;
in std::result::{Ok, Err, Result};

// Contract for sortable types
contract Ord {
    fn lessThan(self : &Self, other : &Self) : Bool;
}

// Implement for I32
impl Ord for I32 {
    fn lessThan(self : &I32, other : &I32) : Bool => {
        return *self < *other;
    }
}

// Generic sort with contract bound
fn bubbleSort<T : Ord>(items : &mut Vec<T>) : Result<Void, Error> => {
    let n = items.len();
    for (i in 0..n) {
        for (j in 0..(n - 1)) {
            if (items[j].lessThan(&items[j + 1]) == false) {
                // Swap
                let temp = items[j];
                items[j] = items[j + 1];
                items[j + 1] = temp;
            }
        }
    };
    return Ok(());
}

// Main entry point — must handle all errors
fn main() : Result<Void, Error> => {
    let mut numbers = Vec::new();
    numbers.push(5);
    numbers.push(2);
    numbers.push(8);
    numbers.push(1);

    // Sort — must handle Result
    let sortResult = bubbleSort(&mut numbers);
    match (sortResult) {
        case v : Ok => {
            for (n in numbers) {
                io::println(n.toString());
            };
        };
        case e : Err => {
            io::println("Sort failed: " + e.message);
        };
    };

    return Ok(());
}
```
