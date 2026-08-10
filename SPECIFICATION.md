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

| Concept | Description |
|---------|-------------|
| Ownership | Each value has exactly one owner; references are borrowed |
| Lifetimes | Compile-time guarantee that references outlive their referents |
| Contracts | Named sets of method signatures, fields, and generic bounds |
| Refinement Types | Compile-time range proofs on numeric types |
| Null Type | First-class `Null` type, distinct from `0` and pointers |
| Result Types | All errors return `Result<T, E>` or `Option<T>` — never panic |
| Continuations | Async/await compiled to continuation-passing form |

### 2.2 Type System Hierarchy

```
Type
├── Primitive Types
│   ├── Bool
│   ├── Char
│   ├── String
│   └── Numeric Types (with refinement)
│       ├── Int<min, max>    (signed, range-constrained)
│       ├── UInt<min, max>   (unsigned, range-constrained)
│       └── Float             (IEEE 754, no overflow panic)
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

### 3.1 Syntax

Tuff uses C/Rust-like syntax with curly braces and semicolons. Parentheses are **required** in control flow conditions.

```tuff
// Basic structure
module my_package

import std::io
import std::collections::Vec

// Function definition with type inference
fn greet(name: String) -> String {
    let message = "Hello, " + name  // type inferred
    return message
}

// Control flow (parentheses required)
fn classify(n: Int) -> String {
    if (n > 0) {
        return "positive"
    } else if (n == 0) {
        return "zero"
    } else {
        return "negative"
    }
}

// Pattern matching (exhaustive)
fn describe(value: Result<String, Error>) -> String {
    match (value) {
        Ok(s) => "Got: " + s,
        Err(e) => "Error: " + e.message,
    }
}

// Nullable pointer
type NullablePtr<T> = &T | Null

fn find_first(items: Vec<String>, target: String) -> NullablePtr<String> {
    for (item in items) {
        if (item == target) {
            return &item
        }
    }
    return Null
}
```

### 3.2 Ownership and Borrowing

```tuff
// Ownership transfer
fn take_ownership(value: Vec<Int>) -> Int {
    let len = value.len()  // borrow
    return len             // value dropped at end
}

// Borrowing
fn first_element(items: &Vec<Int>) -> &Int {
    return &items[0]  // returns borrow of element
}

// Mutable borrow
fn append_item(items: &mut Vec<Int>, item: Int) {
    items.push(item)  // mutates through borrow
}
```

### 3.3 Lifetimes

Tuff supports both **explicit** and **inferred** lifetimes:

```tuff
// Inferred lifetime (compiler determines)
fn longest(a: &String, b: &String) -> &String {
    if (a.len() >= b.len()) {
        return a
    } else {
        return b
    }
}

// Explicit lifetime annotation
fn longest_explicit<'a>(a: &'a String, b: &'a String) -> &'a String {
    if (a.len() >= b.len()) {
        return a
    } else {
        return b
    }
}
```

### 3.4 Contracts

The `contract` keyword defines method signatures, fields, and generic bounds:

```tuff
// Basic contract
contract Serializable {
    fn serialize() -> String
    fn deserialize(data: String) -> Result<Self, Error>
}

// Contract with fields
contract Resource {
    id: UInt<0, MAX>
    fn open() -> Result<Self, Error>
    fn close() -> Result<(), Error>
}

// Contract with generic bounds
contract Container<T: Clone> {
    fn insert(item: T) -> Result<(), Error>
    fn remove(index: UInt<0, MAX>) -> Result<T, Error>
    fn len() -> UInt<0, MAX>
}

// Implementing a contract
struct MyList<T: Clone> {
    items: Vec<T>
}

impl Container<Int> for MyList<Int> {
    fn insert(item: Int) -> Result<(), Error> {
        self.items.push(item)
        return Ok(())
    }
    // ...
}
```

### 3.5 Generics

Generics use monomorphization (code duplicated per type):

```tuff
fn max<T: Ord>(a: T, b: T) -> T {
    if (a >= b) {
        return a
    } else {
        return b
    }
}

// Usage
let n = max(3, 5)        // T = Int
let s = max("a", "b")    // T = String
```

### 3.6 Refinement Types

Compile-time range proofs eliminate integer overflow:

```tuff
// Range-constrained types
type Percentage = Int<0, 100>
type Port = UInt<0, 65535>
type Index = UInt<0, MAX>

fn set_percentage(val: Percentage) {
    // Compiler proves val is in [0, 100]
    self.pct = val
}

// Arithmetic with refinement
fn add_safe(a: Int<0, 100>, b: Int<0, 100>) -> Result<Int<0, 100>, Overflow> {
    let sum = a + b  // Compiler inserts range check
    if (sum >= 0 && sum <= 100) {
        return Ok(sum)
    } else {
        return Err(Overflow)
    }
}
```

### 3.7 Null Safety

`Null` is a first-class type, not equal to `0`:

```tuff
// Nullable pointer as union
type NullablePtr<T> = &T | Null

fn process(node: NullablePtr<TreeNode>) -> String {
    match (node) {
        &n => n.value.toString(),
        Null => "empty",
    }
}

// Null is its own type
val nothing: Null = Null
// nothing != 0  // compile error: types differ
```

### 3.8 Error Handling

All errors are recoverable — there is no panic:

```tuff
// Result type for fallible operations
fn divide(a: Float, b: Float) -> Result<Float, DivByZero> {
    if (b == 0.0) {
        return Err(DivByZero)
    }
    return Ok(a / b)
}

// Caller must handle
fn calculate() -> Result<Float, Error> {
    let result = divide(10.0, 0.0)?  // propagate error
    return Ok(result)
}

// Option for missing values
fn find_key(map: Map<String, Int>, key: String) -> Option<Int> {
    if (map.contains(key)) {
        return Some(map[key])
    }
    return None
}
```

### 3.9 Async/Await

Continuation-passing form enables async even on bare metal:

```tuff
// Async function
async fn fetch_url(url: String) -> Result<String, NetworkError> {
    let response = await http_get(url)
    return Ok(response.body)
}

// Usage
async fn main() -> Result<(), Error> {
    let data = await fetch_url("https://example.com")
    println(data)
    return Ok(())
}

// Compiled to continuation-passing:
// fetch_url(url, fn(result) { ... })
```

### 3.10 Concurrency

Thread safety enforced by ownership:

```tuff
// Send-safe data (owned transfer between threads)
fn spawn_task(data: Vec<Int>) -> Thread {
    return Thread::spawn(move || {
        process(data)  // data moved into thread
    })
}

// Shared state with synchronization
struct Counter {
    value: AtomicInt
}

fn increment(counter: &Counter) {
    counter.value.fetch_add(1)  // atomic, no data race
}
```

### 3.11 C Interoperability

Seamless C FFI is critical:

```tuff
// Import C functions
extern "C" {
    fn malloc(size: UInt) -> *Void
    fn free(ptr: *Void) -> ()
    fn printf(format: *Char, ...) -> Int
}

// Call C libraries directly
fn allocate_buffer(size: UInt) -> *U8 {
    let ptr = malloc(size) as *U8
    return ptr
}

// Export to C
#[export_c]
fn my_function(x: Int, y: Int) -> Int {
    return x + y
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

### 3.13 Closures

Rust-style capture modes:

```tuff
// Borrow capture (default)
let multiplier = |x: Int| -> Int { x * factor }  // borrows factor

// Move capture
let owned_closure = move |x: Int| -> Int { x * owned_data }

// Mutable capture
let mut counter = 0
let increment = || -> () { counter += 1 }  // mutates capture
```

### 3.14 Module System

Namespace-based modules:

```tuff
// File: my_package::math::utils.tuff
module my_package::math::utils

pub fn add(a: Int, b: Int) -> Int {
    return a + b
}

// Import
import my_package::math::utils::add
import my_package::math::*  // wildcard
```

---

## 4. Edge Cases and Error Handling

### 4.1 Undefined Behaviors Eliminated

| Behavior | Tuff's Approach |
|----------|----------------|
| Integer overflow | Refinement types + Result return |
| Division by zero | Returns `Result<T, DivByZero>` |
| Use-after-free | Ownership system prevents at compile time |
| Data races | Ownership + `Send`/`Sync` contracts |
| Null pointer dereference | `Null` type + exhaustive pattern matching |
| Buffer overflow | Bounds-checked arrays and slices |
| Unaligned access | Compiler enforces alignment |
| Uninitialized memory | All variables must be initialized |
| Signed integer overflow | Defined behavior via refinement |
| Dangling references | Lifetime system prevents |

### 4.2 Error Recovery in Bare Metal

In bare metal environments, the caller must handle all errors:

```tuff
// Entry point must return Result
fn main() -> Result<(), FatalError> {
    // All errors propagated up
    // No panic, no crash
    return hardware_init()?
}

// The compiler enforces that all error paths are handled
// at the top level of the call graph
```

### 4.3 Division by Zero

```tuff
// Always returns Result, never crashes
let result: Result<Float, DivByZero> = 1.0 / 0.0
match (result) {
    Ok(val) => println("Result: " + val.toString()),
    Err(DivByZero) => println("Cannot divide by zero"),
}
```

### 4.4 Array Bounds

```tuff
// Bounds checked, returns Result
fn get_item(arr: &Vec<Int>, index: Int) -> Result<Int, IndexOutOfBounds> {
    if (index >= 0 && index < arr.len()) {
        return Ok(arr[index])
    }
    return Err(IndexOutOfBounds)
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
- Export Tuff functions to C via `#[export_c]`
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

| Feature | Tuff | Rust | C | Kotlin | TypeScript |
|---------|------|------|---|--------|------------|
| Undefined Behavior | None | Some (unsafe) | Extensive | None | None |
| Panics | No | Yes | N/A | No | No |
| Memory Safety | Ownership | Ownership | Manual | GC | GC |
| Null Safety | `Null` type | `Option<T>` | Raw pointers | `T?` | `T \| null` |
| Integer Overflow | Result/Refinement | Wrapping/Panic | UB | Checked | Checked |
| Async | Continuation-passing | Futures | Callbacks | Coroutines | Promises |
| FFI | C (native) | C (unsafe) | N/A | Limited | None |
| Type Inference | Yes | Limited | No | Yes | Yes |
| Generics | Monomorphization | Monomorphization | Macros | Erased | Erased |

## Appendix B: Sample Program

```tuff
module main

import std::io
import std::collections::Vec
import std::result::{Ok, Err, Result}

// Contract for sortable types
contract Ord {
    fn less_than(self: &Self, other: &Self) -> Bool
}

// Implement for Int
impl Ord for Int {
    fn less_than(self: &Int, other: &Int) -> Bool {
        return *self < *other
    }
}

// Generic sort with contract bound
fn bubble_sort<T: Ord>(items: &mut Vec<T>) -> Result<(), Error> {
    let n = items.len()
    for (i in 0..n) {
        for (j in 0..(n - 1)) {
            if (items[j].less_than(&items[j + 1]) == false) {
                // Swap
                let temp = items[j]
                items[j] = items[j + 1]
                items[j + 1] = temp
            }
        }
    }
    return Ok(())
}

// Main entry point — must handle all errors
fn main() -> Result<(), Error> {
    let mut numbers = Vec::new()
    numbers.push(5)
    numbers.push(2)
    numbers.push(8)
    numbers.push(1)

    // Sort — must handle Result
    let sort_result = bubble_sort(&mut numbers)
    match (sort_result) {
        Ok(()) => {
            for (n in numbers) {
                io::println(n.toString())
            }
        },
        Err(e) => {
            io::println("Sort failed: " + e.message)
        },
    }

    return Ok(())
}
```
