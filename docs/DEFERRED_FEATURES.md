# Deferred Features

This document tracks features that were removed from the Tuff bootstrap compiler to simplify the initial implementation. These features may be re-added after the compiler is self-hosting.

The design principle is: **C + Templates** as the baseline. Features that don't exist in C (with the exception of generics/templates and tagged unions) are deferred.

## Intersection Types

**Status**: Removed  
**Reason**: Runtime struct merging has no C equivalent and adds significant complexity.

### Syntax

```tuff
struct Point { x: I32, y: I32 }
struct Color { r: I32, g: I32, b: I32 }

let pt = Point { 10, 20 };
let col = Color { 255, 128, 0 };

// Merge two structs into one with all fields
let merged = pt & col;

// Access fields from both component types
let sum = merged.x + merged.y + merged.r + merged.g + merged.b;
```

### Implementation Notes

- Required generating synthetic struct types at compile time
- Field conflicts between components needed resolution rules
- C++ codegen created `_AND_` structs with merge operators
- JS codegen used object spread

### Files Removed

- `bootstrap/src/type_checker/type_checker_intersection.cpp`
- `bootstrap/src/codegen/codegen_cpp_intersection.cpp`
- Related tests in `src/commonTest/tuff/feature14_intersections/`

---

## Ownership & Borrow Checking

**Status**: Removed  
**Reason**: Rust-style memory safety checking is complex and not present in C.

### Move Semantics

```tuff
struct Data { value: I32 }

let d = Data { 42 };
let e = d;           // d is moved to e
// d.value;          // ERROR: use of moved value 'd'
```

### Borrow Rules

```tuff
// Multiple shared borrows allowed
let x: I32 = 10;
let p: *I32 = &x;
let q: *I32 = &x;    // OK

// Exclusive mutable borrow
let mut x: I32 = 42;
let p: *mut I32 = &mut x;
// let q: *I32 = &x; // ERROR: x is mutably borrowed
```

### Lifetime Annotations

```tuff
fn get_ref<a>(p: *a I32): *a I32 => p;
fn first<a, b>(x: *a I32, y: *b I32): *a I32 => x;
```

### Implementation Notes

- Tracked `OwnershipState` per variable (Owned, Moved, Borrowed, BorrowedMut)
- `activeBorrows` map tracked outstanding borrows per variable
- Scope-based borrow release on block exit
- Lifetime elision for single-parameter functions

### Files Removed

- `bootstrap/src/type_checker/type_checker_ownership.cpp`
- `OwnershipState` enum and `BorrowInfo` struct from `ast.h`
- `activeBorrows` map from `type_checker.h`
- Related tests in `src/commonTest/tuff/feature11_ownership/`

---

## Destructors

**Status**: Removed  
**Reason**: RAII-style automatic cleanup is not present in C.

### Syntax

```tuff
// Type with destructor annotation
type Allocated<T, L: USize> = *[T; 0; L] & #free;

// Destructor called automatically when value goes out of scope
extern fn malloc<T, L: USize>(count: SizeOf<T> * L): Allocated<T, L>;
extern fn free(this: Allocated<T, L: USize>): Void;
```

### Implementation Notes

- `~destructor` and `#destructor` syntax for destructor annotations
- Intersection types could include destructor components
- Destructor functions validated to return `Void` and take single `this` parameter

### Files Removed

- Destructor handling from `type_checker_intersection.cpp`
- Related tests in `src/commonTest/tuff/feature15_destructors/`

---

## Multiple-Of Types

**Status**: Removed  
**Reason**: Compile-time numeric constraints are advanced type system features not in C.

### Syntax

```tuff
// Value must be a compile-time multiple of 5
let x: MultipleOf<5, I32> = 15;  // OK
let y: MultipleOf<5, I32> = 17;  // ERROR: 17 is not a multiple of 5

// Arithmetic preserves multiple-of property
let a: MultipleOf<5, I32> = 10;
let b: MultipleOf<5, I32> = 15;
let c = a + b;  // c: MultipleOf<5, I32> = 25
```

### Implementation Notes

- Validated literal values at compile time
- Tracked multiple-of constraints through arithmetic operations
- Subtyping: `MultipleOf<10, I32>` is subtype of `MultipleOf<5, I32>`

### Files Removed

- `bootstrap/src/type_checker/type_checker_multiple_of.cpp`
- Related tests in `src/commonTest/tuff/feature19_multiple_of/`

---

## Future Considerations

When re-adding these features after self-hosting:

1. **Intersection Types**: Consider simpler "struct embedding" like Go instead of full intersection
2. **Ownership**: May want subset of Rust's rules - perhaps just move semantics without full borrow checking
3. **Destructors**: Could implement as explicit `defer` statements instead of RAII
4. **Multiple-Of Types**: Useful for array indexing safety, but could be library-level instead of built-in
