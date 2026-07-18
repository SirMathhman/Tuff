# Tuff Undefined Behavior Prevention Specification

## Overview

Tuff is designed to eliminate all undefined behavior (UB) at compile time, with the sole exception of Foreign Function Interface (FFI) calls. This document specifies how each category of UB is prevented through the type system, borrow checker, refinement types, and compile-time proofs.

**Design Principle**: If code compiles, it is free of undefined behavior.

**Related Documents:**
- `SPECIFICATION.md` — Core language specification (syntax, types, semantics). That document states *what* the language is; this document specifies *how* safety is enforced.
- `MINIMAL_SELF_HOSTING.md` — The minimal feature subset needed for a self-hosting compiler, which defers most of these safety mechanisms.

---

## 1. Memory Safety

### 1.1 Use-After-Free

**UB in C**: Accessing memory through a pointer after the memory has been freed.

**Prevention Mechanism**: Compile-time borrow checker with lexical lifetimes.

**Rules**:
- Each value has exactly one owner
- References (`&T`, `&mut T`) borrow from the owner
- References cannot outlive their referent
- Compiler tracks reference validity through lexical scopes
- No non-lexical lifetimes (NLL) in MVP

**Example**:
```tuff
fn example() : Void => {
    let x = allocate_value();
    let ref1 : &Type = &x;
    // drop(x); // Error: x is borrowed by ref1
    // x is dropped at scope exit, after ref1 is no longer used
}
```

**Compile-Time Check**: The compiler rejects any code where a reference is used after its referent has been dropped or moved.

---

### 1.2 Double-Free

**UB in C**: Calling `free()` on the same memory twice.

**Prevention Mechanism**: Ownership system with automatic drop on scope exit.

**Rules**:
- Values are automatically dropped when their owner goes out of scope
- No explicit `free()` call for regular values
- Ownership transfers on move; old owner can no longer access the value
- The `then` keyword attaches cleanup functions that run exactly once on scope exit

**Example**:
```tuff
type Box<T> = &T then free;

fn example() : Void => {
    let box : Box<I32> = allocate_box();
    // `free` runs exactly once when `box` goes out of scope
}
// No possibility of double-free: `box` is dropped once at scope exit
```

**Compile-Time Check**: The ownership system ensures each value is dropped exactly once.

---

### 1.3 Dangling Pointers

**UB in C**: Using a pointer to memory that no longer exists.

**Prevention Mechanism**: Borrow checker with lifetime tracking.

**Rules**:
- References are validated against their referent's lifetime
- Lexical scoping determines reference validity
- No raw pointers exist in Tuff
- All references are tracked by the compiler

**Example**:
```tuff
fn example() : &I32 => {
    let x : I32 = 42;
    // return &x; // Error: x will be dropped when function returns
}
```

**Compile-Time Check**: The compiler rejects returning references to local variables.

---

### 1.4 Buffer Overflow / Out-of-Bounds Access

**UB in C**: Accessing array elements outside their bounds.

**Prevention Mechanism**: Refinement types with compile-time proofs.

**Rules**:
- Array type: `[T; L]` where `L` is the length
- Index type must satisfy: `USize < L` (i.e., `0 <= index < L`)
- Array access `array[k]` is valid **if and only if** `0 <= k < L`
- If `L` is 0, then all indices are invalid
- Refinement types appear in function signatures
- Caller must prove index satisfies the refinement

**Syntax**:
```tuff
let array : [I32; 10] = [0; 10];
let validIndex : USize < 10 = 5;
let value = array[validIndex]; // Valid: 5 < 10 proven

let badIndex : USize = 15;
// array[badIndex]; // Error: 15 not proven < 10
```

**Function Signatures**:
```tuff
fn get<T, N : USize>(arr : &[T; N], index : USize < N) : T => {
    return arr[index]; // Safe: index proven < N
}
```

**Compile-Time Check**: The compiler verifies that the index type's refinement satisfies the array's bounds. If proof fails, compilation fails with a detailed error.

---

### 1.5 Uninitialized Memory

**UB in C**: Reading from memory that has not been initialized.

**Prevention Mechanism**: `uninit` type with write-only semantics.

**Rules**:
- `uninit [T; L]` represents uninitialized memory
- `uninit` values **cannot be read**, only written to
- The `uninit` qualifier disappears once all elements are written
- Full initialization must happen at once via closure

**Syntax**:
```tuff
// FFI allocation returns uninitialized memory
extern fn malloc<T, L : USize>(bytes : SizeOf<T> * L) : &mut uninit [T; L] then free;

fn example() : Void => {
    let ptr = malloc<I32, 10>();
    // *ptr[0]; // Error: ptr is uninit, cannot read
    
    // Initialize all elements at once
    ptr[..] = (index : USize < ptr.length) : T => index * 2;
    
    // Now ptr has type &mut [T; L] (uninit gone)
    let val = ptr[0]; // Valid: memory is initialized
}
```

**Closure Initialization**:
- The `array[..] = closure` syntax initializes all elements simultaneously
- The closure receives each index and returns the value for that position
- Side effects in the closure are allowed
- The `uninit` type is consumed and replaced with the initialized type

**No Partial Initialization or Element References**:
- Individual elements of an `uninit` array **cannot** be written to
- References to individual `uninit` elements **cannot** be taken (`&mut uninit_arr[3]` is a compile error)
- This avoids the need to track per-element initialization state at compile time
- The only way to initialize an `uninit` array is the full-array `array[..] = closure` form
- This guarantees: after initialization, every element holds a valid value of type `T`

**Compile-Time Check**: The compiler tracks initialization state and rejects reads from `uninit` memory, writes to individual `uninit` elements, and references to individual `uninit` elements.

---

## 2. Null Safety

### 2.1 Null Pointer Dereference

**UB in C**: Dereferencing a null pointer.

**Prevention Mechanism**: Null as a first-class type with union handling.

**Rules**:
- `Null` is its own type
- Nullable types are expressed as unions: `&T | Null`
- A nullable type **cannot be dereferenced** without pattern matching
- The `is` operator extracts the non-null variant

**Syntax**:
```tuff
type NullablePtr<T> = &T | Null;

fn example(ptr : NullablePtr<I32>) : Void => {
    // *ptr; // Error: ptr might be Null, cannot dereference
    
    if (ptr is &T) {
        // ptr is narrowed to &T in this branch
        let val = *ptr; // Valid: proven non-null
    }
    
    // Alternative with match
    match (ptr) {
        case &T => { /* use dereferenced value */ },
        case Null => { /* handle null case */ },
    }
}
```

**Compile-Time Check**: The compiler rejects dereferencing a type that includes `Null` in its union. Pattern matching narrows the type to the safe variant.

---

## 3. Arithmetic Safety

### 3.1 Integer Overflow

**UB in C**: Signed integer overflow is undefined behavior.

**Prevention Mechanism**: Refinement types with range proofs.

**Rules**:
- The compiler tracks value ranges through operations
- Arithmetic is safe if the result range fits in the target type
- Hybrid approach: compiler infers ranges, programmer may annotate
- Proof failure results in compile error

**Syntax**:
```tuff
fn safe_add(a : I32 > -1000, b : I32 > -1000) : I32 => {
    // Compiler proves: a + b fits in I32 range
    // because a > -1000 && b > -1000 => a + b > -2000 > I32::MIN
    return a + b;
}
```

**Range Tracking**:
- Compiler tracks minimum and maximum values through expressions
- Refinements narrow the possible value range
- Arithmetic safety is proven by checking result range against type bounds

**Compile-Time Check**: If the compiler cannot prove the arithmetic result fits in the target type, compilation fails.

---

### 3.2 Division by Zero

**UB in C**: Dividing by zero is undefined behavior.

**Prevention Mechanism**: Non-zero refinement type.

**Rules**:
- Divisor must have type `Type != 0`
- Caller must prove the divisor is non-zero
- Refinement appears in function signature

**Syntax**:
```tuff
fn divide(a : I32, b : I32 != 0) : I32 => {
    return a / b; // Safe: b proven != 0
}

fn example() : Void => {
    let x : I32 = 10;
    let y : I32 != 0 = 5; // Must prove y != 0
    let result = divide(x, y); // Valid
}
```

**Compile-Time Check**: The caller must provide a value whose type satisfies the `!= 0` refinement.

---

### 3.3 Division and Modulo Overflow

**UB in C**: `I32::MIN / -1` and `I32::MIN % -1` overflow because the result (`-I32::MIN`) does not fit in `I32`. This is UB even though the divisor is non-zero.

**Prevention Mechanism**: Extended divisor refinement.

**Rules**:
- Division and modulo require: `b : I32 != 0` (base rule, Section 3.2)
- Additionally, when `a` could be `I32::MIN`, the divisor must not be `-1`
- The compiler's range tracking handles this automatically:
  - If `a` is proven `I32 > I32::MIN`, then `b : I32 != 0` suffices
  - If `a` could equal `I32::MIN`, then `b` must satisfy `I32 != 0 && I32 != -1`
- Same rules apply to `%` (modulo)

**Examples**:
```tuff
// a is unrestricted: divisor needs stronger refinement
fn divide_min(a : I32, b : I32 != 0 && I32 != -1) : I32 => a / b;

// a is proven > MIN: only non-zero needed
fn divide_safe(a : I32 > I32::MIN, b : I32 != 0) : I32 => a / b;

// Signed division of unsigned types: no overflow concern
fn divide_unsigned(a : U32, b : U32 != 0) : U32 => a / b; // Always safe
```

**Compile-Time Check**: The compiler tracks the dividend's range; if it could be the type's minimum, the divisor refinement is strengthened.

---

### 3.4 Float-to-Integer Casts

**UB in C**: Casting a float value outside the target integer type's range is undefined behavior (e.g., `(1e30) as I32` in C).

**Prevention Mechanism**: Refinement proof required.

**Rules**:
- Float-to-int `as` casts are not widening — they require proof
- The compiler must prove the float value's range fits within the target integer type's range
- Proof established via refinements on the source float value

**Examples**:
```tuff
let f : F64 = 100.5;
// let x = f as I32; // Error: cannot prove f fits in I32 range

let g : F64 >= -2147483648.0 && F64 <= 2147483647.0 = 100.5;
let y = g as I32; // OK: refinement proves range

// Note: NaN and Infinity never satisfy such refinements,
// so they can never be cast
```

**Compile-Time Check**: The compiler verifies the float refinement guarantees the value is within the integer type's representable range. NaN and infinity are excluded because they cannot satisfy any finite-range refinement.

---

### 3.5 Shift Overflow

**UB in C**: Shifting by >= bit width of the type is undefined behavior.

**Prevention Mechanism**: Refinement type on shift amount.

**Rules**:
- Shift amount must satisfy: `USize < bit_width`
- For `I32`: shift amount must be `USize < 32`
- For `I64`: shift amount must be `USize < 64`

**Syntax**:
```tuff
fn shift_left(value : I32, amount : USize < 32) : I32 => {
    return value << amount; // Safe: amount proven < 32
}
```

**Compile-Time Check**: The compiler verifies the shift amount refinement.

---

## 4. Type Safety

### 4.1 Type Confusion

**UB in C**: Accessing memory through a pointer of incompatible type (strict aliasing violation).

**Prevention Mechanism**: Strict compile-time type checking, no raw pointers.

**Rules**:
- References are strongly typed: `&T` can only reference `T`
- No implicit casts between unrelated pointer types
- Explicit casts via `as` require compile-time proof of safety
- No raw pointers exist to bypass type checks

**Example**:
```tuff
let x : I32 = 5;
let ref_i : &I32 = &x;
// let ref_f : &F32 = ref_i as &F32; // Error: cannot cast &I32 to &F32
```

**Compile-Time Check**: The compiler rejects casts between incompatible reference types.

---

### 4.2 Union Type Confusion

**UB in C**: Reading the wrong variant of a union.

**Prevention Mechanism**: Tagged unions with hidden discriminant.

**Rules**:
- Unions compile to a struct with a hidden tag and an anonymous union
- The tag tracks which variant is active
- The tag is accessed only through the `is` operator
- Pattern matching extracts the correct variant

**Compiled Representation**:
```c
// C representation (internal)
struct Option<T> {
    tag : enum { Some, None },
    data : union {
        some : { field : T },
        none : {}
    }
};
```

**Tuff Syntax**:
```tuff
struct Some<T> { field : T }
struct None<T> {}
type Option<T> = Some<T> | None<T>;

let option : Option<I32> = Some<I32> { field: 100 };

if (option is Some { field }) {
    // `field` is extracted and available in this scope
    // Type of `field` is I32
}
```

**Compile-Time Check**: The compiler tracks the active variant through control flow and rejects access to the wrong variant.

---

## 5. Reference Safety

### 5.1 Aliasing Violations

**UB in C**: Having both mutable and immutable aliases to the same data.

**Prevention Mechanism**: Borrow checker rules.

**Rules**:
- Multiple immutable references (`&T`) may coexist
- Only one mutable reference (`&mut T`) may exist at a time
- Mutable and immutable references cannot coexist
- Rules enforced through lexical scope analysis

**Example**:
```tuff
fn example() : Void => {
    let mut x : I32 = 42;
    let ref1 : &I32 = &x;
    // let ref2 : &mut I32 = &mut x; // Error: immutable ref1 exists
    // x = 10; // Error: x is borrowed by ref1
}
```

**Compile-Time Check**: The borrow checker rejects code that violates aliasing rules.

---

### 5.2 Reference Dereference Safety

**UB in C**: Dereferencing an invalid or misaligned pointer.

**Prevention Mechanism**: Type system guarantees.

**Rules**:
- All references are guaranteed to be valid (point to live memory)
- All references are guaranteed to be properly aligned
- Dereferencing (`*ref`) is always safe for non-null references
- No raw pointers exist that could be invalid

**Compile-Time Check**: The borrow checker ensures references are valid; the compiler ensures alignment.

---

## 6. Concurrency Safety

### 6.1 Data Races

**UB in C**: Concurrent access to shared mutable data without synchronization.

**Prevention Mechanism**: Ownership prevents shared mutability.

**Rules**:
- Values have a single owner
- Shared data must be immutable (`&T`, not `&mut T`)
- Mutable data cannot be shared across threads
- Ownership transfer prevents simultaneous access

**Compile-Time Check**: The type system prevents mutable data from being shared.

---

## 7. FFI Safety Boundary

### 7.1 FFI as Trusted Boundary

**Exception**: FFI calls are the only source of potential UB in Tuff.

**Rules**:
- FFI functions are declared with `extern`
- FFI return values are trusted (not validated)
- FFI calls are isolated from safe code
- Programmers must ensure FFI calls are correct

**Syntax**:
```tuff
extern fn malloc(size : U64) : &mut uninit U8;
extern fn free(ptr : &mut U8) : Void;

let { extern malloc, extern free } = extern stdlib;
```

**Design Decision**: FFI results are trusted rather than tainted, keeping the language simpler. The responsibility for FFI safety lies with the programmer.

---

## 8. Refinement Type System

### 8.1 Syntax

Refinement types extend base types with predicates:

```tuff
USize < 10           // Unsigned integer, 0 <= x < 10
I32 != 0             // Signed integer, x != 0
USize < arr.length   // Unsigned integer, x < arr.length
USize < 10 && USize != 5  // Composite refinement
```

**Lower Bound Inference**:
- `USize < N` implies `0 <= x < N` (lower bound inferred from unsigned)
- `I32 > 0` implies `x > 0` (no upper bound)
- `I32 != 0` implies `x != 0` (exclusion)

### 8.2 Composition

Refinements can be combined with `&&`:
```tuff
let x : USize < 10 && USize != 5 = 3; // Valid: 3 < 10 && 3 != 5
```

### 8.3 Expressions in Refinements

Refinements support compile-time computable expressions:
```tuff
fn safeIndex<T, N : USize>(arr : &[T; N], index : USize < N) : T
fn rangeCheck(value : I32, min : I32, max : I32) : I32 > min && I32 < max
```

### 8.4 Proof Requirements

- **Caller proves**: When calling a function with refined parameters, the caller must provide values that satisfy the refinements
- **Compiler verifies**: The compiler checks that provided values satisfy refinements
- **Hard error**: Proof failure results in a compile error with detailed message

### 8.5 Verification Implementation

The verification mechanism is left to compiler designers (SMT solver, abstract interpretation, dataflow analysis, etc.). The specification requires that all refinements be verified at compile time.

---

## 9. Type System Interaction Holes

This section covers undefined behavior that arises from *interactions between* language features — the subtle cases where individually-safe features compose into unsound behavior.

### 9.1 Refinement Invalidation via Mutable References

**The Hole**: If a value carries a refinement (e.g., `I32 > 0`), taking a mutable reference to it could allow writing a value that violates the refinement.

```tuff
let x : I32 > 0 = 5;
let r : &mut ??? = &mut x;
*r = -10; // If r is &mut I32, x's refinement is violated!
```

**Prevention Mechanism**: Refinements are part of the type, not just the binding.

**Rules**:
- The type of `x` is `I32 > 0` — permanently
- `&mut x` has type `&mut (I32 > 0)`
- Writes through `&mut (I32 > 0)` must satisfy the refinement
- `*r = -10` is a **compile error**: `-10` does not satisfy `I32 > 0`
- Refinements cannot be stripped by borrowing

**Compile-Time Check**: Every write through a mutable reference is checked against the referent's refinement.

---

### 9.2 Function Pointer Refinement Bypass

**The Hole**: Function pointers could be used to bypass parameter refinements.

```tuff
fn divide(a : I32, b : I32 != 0) : I32 => a / b;
let f : &(I32, I32) => I32 = &divide; // Refinement lost?
f(10, 0); // UB!
```

**Prevention Mechanism**: Function pointer types carry refinements.

**Rules**:
- The type of `divide` is `&(I32, I32 != 0) => I32`
- Function pointer types include full parameter refinements
- Coercion from `&(I32, I32 != 0) => I32` to `&(I32, I32) => I32` is a **compile error**
- A function pointer is only callable with arguments satisfying its refinements
- Caller must provide proofs at the call site, even through pointers

**Compile-Time Check**: Function pointer types are compared including refinements; coercions that weaken refinements are rejected.

---

### 9.3 Invalid Enum Discriminants

**The Hole**: Casting an arbitrary integer to an enum type could produce an invalid discriminant value.

```tuff
enum Color { Red, Green, Blue } // values 0, 1, 2
let c = 999 as Color; // Invalid discriminant!
```

**Prevention Mechanism**: Integer-to-enum casts are forbidden.

**Rules**:
- `as` casts to enum types are always **compile errors**
- Enum values can only be produced by naming a variant: `Color.Red`
- No mechanism exists to create invalid discriminants
- This is stricter than general `as` cast rules (see 9.6)

**Compile-Time Check**: The compiler rejects all integer-to-enum casts.

---

### 9.4 Self-Referential Structs

**The Hole**: A struct containing a reference to its own field would dangle when moved.

```tuff
struct Node {
    data : I32,
    ptr : &I32 // If ptr borrows data, moving Node dangles ptr
}
```

**Prevention Mechanism**: The borrow checker prevents construction.

**Rules**:
- To construct `Node`, `ptr` must borrow something
- If `ptr` borrows `data` of the same struct being constructed, the borrow would need to exist before the struct is fully constructed
- This is a compile error: cannot borrow a value that doesn't exist yet
- Moving any struct moves all its fields; references into the struct's own fields cannot exist (borrow checker)

**Compile-Time Check**: Borrow checking rejects any struct construction where a field borrows from another field of the same (not-yet-constructed) value.

---

### 9.5 Union Variant Overwrite with Live Borrows

**The Hole**: Borrowing a value from a union, then overwriting the union's active variant, dangles the borrow.

```tuff
let u : I32 | F32 = ...;
let r : &I32 = ??? from u;
u = F32 { ... }; // Overwrite — does r dangle?
```

**Prevention Mechanism**: Union variants cannot be borrowed individually.

**Rules**:
- The `is` operator and `match` do **not** yield references to union contents
- Extraction from a union produces a value (move or copy), never a reference into the union
- Since no borrows into union storage exist, overwriting the union cannot dangle anything
- Moving out of a union requires proving the active variant (via `is`/`match`), and the union is consumed or the value is copied

**Compile-Time Check**: The type system provides no operation that borrows into a union's active variant storage.

---

### 9.6 General `as` Cast Rules

**The Hole**: Unrestricted casts can produce invalid values (out-of-range integers, etc.).

**Prevention Mechanism**: All non-widening casts require proofs.

**Rules**:
- **Widening casts** (target type's range ⊇ source type's range) are always allowed: `I32 as I64`, `U8 as U32`
- **All other casts** require the compiler to prove the source value fits in the target type
- Proof is established via refinements on the source value

**Examples**:
```tuff
let a : I32 = 100;
let b = a as I64; // OK: widening

let c : U64 = 100;
// let d = c as U32; // Error: cannot prove c fits in U32

let e : U64 <= U32::MAX = 100;
let f = e as U32; // OK: refinement proves range

// Enum casts always forbidden (see 9.3)
```

**Compile-Time Check**: The compiler verifies that the source value's known range (from its type refinements) is a subset of the target type's range.

---

### 9.7 Escaping Closures and Generators

**The Hole**: A closure or generator capturing a reference to a local variable could escape the local's scope, leaving a dangling reference.

```tuff
fn make_gen() : () => (I32, Bool) => {
    let local = [1, 2, 3];
    return () => (I32, Bool) => {
        // Uses local — but local is dropped when make_gen returns!
    };
}
```

**Prevention Mechanism**: Borrow checker applies to closure captures.

**Rules**:
- Tuff has three closure variants, distinguished by capture mode:
  - `(params) => T` — immutable captures (equivalent to Rust's `Fn`)
  - `(&mut, params) => T` — mutable captures (equivalent to Rust's `FnMut`)
  - `(move, params) => T` — move captures (equivalent to Rust's `FnOnce`)
- Closure captures are checked by the same borrow checker as normal references
- A closure holding a borrow cannot escape the scope of the borrowed value
- Returning a closure that borrows a local is a **compile error**
- `(move, ...)` closures take ownership of captures; moved captures cannot dangle (the value lives as long as the closure)

**Compile-Time Check**: The borrow checker treats closure captures as borrows and rejects closures that would outlive their captured references.

---

### 9.8 Generator Post-Exhaustion Calls

**The Hole**: A generator returning `(T, Bool)` signals exhaustion with `Bool = false`. Calling it again after exhaustion could have unpredictable behavior.

**Prevention Mechanism**: Deterministic runtime behavior.

**Rules**:
- After a generator returns `(val, false)`, subsequent calls must deterministically return `(default(T), false)` or the same behavior
- Generators are not required to be pure or stateless, but post-exhaustion behavior must be deterministic
- The `for (x in gen)` loop stops at the first `false` and never calls the generator again
- Direct calls after exhaustion do not produce UB, only a specified deterministic result

**Design Rationale**: Since generators are closures with captured state, fully static exhaustion tracking would require type-state refinements on mutable state, which is beyond MVP complexity. A deterministic runtime guarantee suffices to prevent UB.

---

### 9.9 Boolean Validity

**The Hole**: `Bool` has only two valid bit patterns (0 and 1). An invalid bit pattern in a `Bool` (e.g., from uninitialized memory) is UB in many languages.

**Prevention Mechanism**: Impossible by construction.

**Rules**:
- `uninit` memory cannot be read (Section 1.5), so invalid bit patterns cannot enter the system
- `uninit` arrays must be fully initialized via closure, which must produce valid `Bool` values
- No mechanism exists to cast arbitrary bytes to `Bool`
- Float-to-int, int-to-int, and all `as` casts to `Bool` are compile errors (only `Bool` literals and expressions produce `Bool`)

**Compile-Time Check**: The type system guarantees every `Bool` value was constructed from `true`, `false`, or a boolean expression.

---

### 9.10 Refined Struct Fields

**The Hole**: If struct fields could not carry refinements, refinement guarantees would be lost when values are stored in structs.

**Prevention Mechanism**: Refinements are supported on struct fields and maintained on writes.

**Rules**:
- Struct fields may carry refinements: `struct Positive { value : I32 > 0 }`
- Refinements are checked at struct construction
- Refinements are checked on every field write: `p.value = -5` is a compile error
- Refinements are preserved when the struct is moved, copied, or borrowed
- Field refinements compose with local refinements: extracting `p.value` yields a value of type `I32 > 0`

**Compile-Time Check**: All field writes (direct or through `&mut`) are validated against the field's refinement.

---

### 9.11 `then` Cleanup Ordering

**The Hole**: Without specified ordering, cleanup functions for multiple droppable values in the same scope could run in an unpredictable order, potentially causing use-after-free if one cleanup depends on another value.

**Prevention Mechanism**: Reverse declaration order (LIFO).

**Rules**:
- Cleanup functions attached via `then` run in **reverse declaration order** (last declared, first cleaned)
- This matches C++ destructor semantics and is intuitive: values are cleaned up in the opposite order they were created
- With early `return`, all values in scope at the point of return are cleaned in reverse declaration order
- Nested scopes follow the same rule: inner scope values clean first, then outer

**Example**:
```tuff
fn example() : Void => {
    let a = alloc_a(); // declared 1st, cleaned 3rd
    let b = alloc_b(); // declared 2nd, cleaned 2nd
    let c = alloc_c(); // declared 3rd, cleaned 1st
    // implicit: cleanup c, then b, then a
    return; // same order applies here
}
```

**Compile-Time Guarantee**: Cleanup ordering is fully determined by declaration order; no UB from ordering.

---

## 10. Additional UB Prevention

### 10.1 Format String Vulnerabilities

**Prevention**: No printf-style format strings in the language core. String formatting is handled through type-safe library functions.

### 10.2 Integer-to-Pointer Casts

**Prevention**: No casting between integers and pointers. The type system enforces strict separation.

### 10.3 Strict Aliasing

**Prevention**: No raw pointers exist. All references are type-checked. Type confusion is prevented by the type system.

### 10.4 Self-Assignment

**Not UB**: `x = x` is valid due to ownership semantics (move from and to self). No const values exist (only `mut` vs immutable).

### 10.5 Stack Overflow

**Not Prevented**: Stack overflow is accepted as unspecified behavior, not classified as UB. Rationale: the language cannot prove termination (halting problem), so it cannot statically guarantee stack bounds. The compiler makes no guarantee about behavior after stack exhaustion, but the language semantics do not classify this as UB since it cannot be detected or prevented at compile time.

---

## 11. Error Reporting

### 11.1 Refinement Failure

When a refinement proof fails, the compiler provides:
- Which refinement was not satisfied
- What value/range was provided
- What value/range was expected
- Suggested fixes when possible

**Example Error**:
```
Error: Cannot prove index < array.length
  Provided: index : USize (range: 0..65535)
  Required: USize < 10 (range: 0..9)
  Suggestion: Add refinement: let index : USize < 10 = ...;
```

### 11.2 Borrow Checker Errors

When borrow checking fails, the compiler provides:
- Which reference conflicts with which
- Lifetime information
- Suggested scope adjustments

---

## Appendix A: UB Sources Covered

| UB Category | Specific UB | Prevention |
|-------------|-------------|------------|
| Memory | Use-after-free | Borrow checker |
| Memory | Double-free | Ownership system |
| Memory | Dangling pointers | Lifetime tracking |
| Memory | Buffer overflow | Refinement types |
| Memory | Uninitialized read | `uninit` type |
| Memory | Partial uninit writes | Full-array init only |
| Memory | Uninit element refs | No refs to uninit elements |
| Null | Null dereference | Union + pattern matching |
| Arithmetic | Integer overflow | Range proofs |
| Arithmetic | Division by zero | Non-zero refinement |
| Arithmetic | Division/modulo overflow | Extended divisor refinement |
| Arithmetic | Shift overflow | Shift amount refinement |
| Arithmetic | Float-to-int out of range | Refinement proof required |
| Type | Type confusion | Strict type checking |
| Type | Union misread | Tagged unions |
| Type | Invalid enum discriminants | No int-to-enum casts |
| Type | Invalid Bool bit patterns | Impossible by construction |
| Type | Out-of-range `as` casts | Refinement proof required |
| Reference | Aliasing violations | Borrow checker |
| Reference | Invalid dereference | Type guarantees |
| Reference | Refinement invalidation via `&mut` | Refinement is part of type |
| Interaction | Fn ptr refinement bypass | Refinements in fn ptr types |
| Interaction | Self-referential structs | Borrow checker prevents |
| Interaction | Union overwrite with borrows | No borrows into unions |
| Interaction | Escaping closure captures | Borrow checker on captures |
| Interaction | Generator post-exhaustion | Deterministic runtime behavior |
| Interaction | Refined field violation | Maintained on all writes |
| Interaction | Cleanup ordering UB | Reverse declaration (LIFO) |
| Concurrency | Data races | Ownership |

## Appendix B: UB Sources Excluded

| UB Category | Reason |
|-------------|--------|
| FFI calls | External code, trusted boundary |
| Stack overflow | Unspecified (cannot prove termination) |
| Integer overflow (unsigned) | MVP: unspecified behavior |
