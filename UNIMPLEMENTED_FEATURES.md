# Unimplemented Tuff Language Features

This document lists language features expressed in `/src/main/tuff/*.tuff` files that are **not yet** supported by the current interpreter/compiler implementation. This is what we are building to.

## Core Language Features

### 1. **Type Constraints in Function Parameters**

_Location: `collections.tuff`, `memory.tuff`_

```tuff
fn get(index : USize < this.size()) => array[index];
```

- Function parameters with compile-time constraints/bounds
- Currently: No support for constraint syntax in parameter lists

### 2. **Union Types**

_Location: `option.tuff`_

```tuff
type Option<T> = Some<T> | None<T>;
```

- Type aliases defined as unions of possible types
- Currently: Type aliases exist but not union types

### 3. **Void Return Type**

_Location: `memory.tuff`_

```tuff
fn free<T>(this : Alloc<T>) : Void;
```

- Explicit void/unit return type annotation
- Currently: Functions must return `number`

### 4. **Range Syntax**

_Location: `collections.tuff`_

```tuff
for (let mut i in 0..(index - array.init)) { ... }
```

- Range creation via `start..end` operator
- Currently: For-in works with arrays but not numeric ranges

### 5. **Mutable Pointer Parameters**

_Location: `collections.tuff`, `string.tuff`_

```tuff
fn set(*mut this, index : USize, element : T) => { ... }
extern fn concat(this : *mut *Str, other : **Str) : *Str;
```

- `*mut` prefix for mutable pointers as function parameters
- Multiple levels of indirection (`**T`)
- Currently: Basic pointer support; `*mut` not fully integrated

---

## Module System Features

### 6. **Module Input Parameters (Dependency Injection)**

_Location: `collections.tuff`_

```tuff
in let allocator : Allocator;
```

- Module-level declarations that accept injected dependencies
- Acts as a module parameter that must be provided at import time
- Currently: Modules are not parameterizable; `in let` not supported

### 7. **Parameterized Module Imports**

_Location: `main.tuff`_

```tuff
use { ArrayList } from collections { allocator : GlobalAllocator };
```

- Passing arguments when importing from a module
- Supplies values/modules to satisfy `in let` dependencies
- Currently: `compileAll` strips these; compiler doesn't parse module parameters

### 8. **Contracts (Interface/Trait-like Constructs)**

_Location: `collections.tuff`, `memory.tuff`_

```tuff
out contract Allocator {
    fn alloc<T>(length : USize) : Option<Alloc<T>>;
}

out contract Iterable<T> {
    fn createIterator() : Iterator<T>;
}
```

- Named contracts defining a set of required methods
- Any type can implement a contract via `with` keyword
- Acts as both definition and constraint (like Rust traits / TypeScript interfaces)
- Currently: No contract/trait system; `contract` keyword not recognized

### 9. **Contract Implementation**

_Location: `collections.tuff`_

```tuff
with Iterable<T>;
```

- Explicit declaration that a type/object implements a contract
- Appears at end of function/object definition
- Currently: Not supported

### 10. **Dependent Objects with Contract Constraints**

_Location: `memory.tuff`_

```tuff
out object DefaultAllocator : Allocator = { ... };
```

- Object that explicitly implements a named contract
- Type annotation shows contract satisfaction
- Currently: Objects exist but without contract annotations

---

## Function & Generic Features

### 11. **Module-Level Native Functions**

_Location: `memory.tuff`_

```tuff
module StandardLibrary {
    extern fn alloc<T>(length : USize) : Option<Alloc<T>>;
}
```

- `extern fn` declarations inside modules (not just at top level)
- Located in a module scope and called via `Module::name`
- Currently: `extern fn` only at top level; no module-scoped externs

### 12. **Generic Functions with Callable Parameters**

_Location: `collections.tuff`_

```tuff
fn ArrayList<T>(createDefaultValue : () => T) => { ... }
```

- Generic functions accepting function-type parameters (closures/callbacks)
- The callback is generic and parameterized by `T`
- Currently: Generic functions exist; function parameters work; combination may not be fully tested

### 13. **Function Returning Callable (Higher-Order Functions)**

_Location: `collections.tuff`_

```tuff
fn createIterator() => {
    let mut counter = 0;
    fn next() => if (counter < size) { ... } else { ... };
    next
}
```

- Function that returns another function (a closure)
- Returned function captures variables from outer scope
- Currently: Basic closures exist; returning functions not well tested

### 14. **Method Chaining with Implicit `this` Return**

_Location: `main.tuff`_

```tuff
list.add(1).add(2).add(3);
```

- Methods implicitly return `this` when not specified
- Enables fluent interface pattern
- Currently: No implicit `this` return for methods (must be explicit)

---

## Standard Library & Native Integration

### 15. **Destructor Registration in Type Aliases**

_Location: `memory.tuff`_

```tuff
type Alloc<T> = *[T] then this.free;
```

- Type alias with cleanup function specified via `then`
- Cleanup is called automatically when variable goes out of scope
- Currently: Test coverage shows `then drop` works for some cases; generalized destructor on type aliases may not be complete

### 16. **String Methods**

_Location: `main.tuff`, `string.tuff`_

```tuff
result = result.concat(element.toString());
```

- `.concat()` for string concatenation
- `.toString()` for value-to-string conversion
- Currently: String methods not implemented in standard library

### 17. **Iterator Protocol and Custom For-In**

_Location: `main.tuff`, `collections.tuff`_

```tuff
for (let mut element in list) {
    // ...
}
```

- For-in loops over custom iterables (types implementing `Iterable<T>`)
- Requires calling `createIterator()` and iterating with `(continue, value)` tuples
- Currently: For-in works with arrays and ranges; custom iterators not supported

### 18. **Generic Type Instantiation with Inferred Parameters**

_Location: `main.tuff`_

```tuff
let mut list = ArrayList<I32>();
```

- Creating instances of generic types with explicit type parameters
- Currently: Generic structs can be instantiated; generic functions work; but generic function-like factories (`ArrayList<I32>()`) may not be fully supported

---

## Export & Module Declaration Features

### 19. **Export Declarations in .tuff Files**

_Location: `option.tuff`_

```tuff
export struct Some<T> { value : T }
export object None<T> {}
```

- `export` keyword marking public items
- Currently: `out` is used internally; `export` keyword not standard in our syntax

---

## Summary of Feature Categories

| Category                   | Count      | Priority |
| -------------------------- | ---------- | -------- |
| **Module System**          | 5 features | High     |
| **Contracts/Traits**       | 2 features | High     |
| **Type System Extensions** | 3 features | Medium   |
| **Function Features**      | 4 features | Medium   |
| **Standard Library**       | 3 features | Medium   |
| **Iterators**              | 1 feature  | Medium   |
| **Other**                  | 1 feature  | Low      |

---

## Implementation Dependencies

These features have complex interdependencies:

1. **Contracts** (8, 9) are foundational and will unblock many features
2. **Module Parameters** (6, 7) require both contract support and a parameterization system
3. **Iterator Protocol** (17) requires contracts + for-in enhancement
4. **Union Types** (2) are simpler and can be implemented independently
5. **String Methods** (16) are straightforward and good quick wins
6. **Void Return Type** (3) is a simple addition
7. **Range Syntax** (4) is mostly syntactic sugar; needs numeric range support

---

## Notes

- Current tests are comprehensive for: arithmetic, strings, variables, functions, generics, pointers, modules (basic), control flow
- Tests are light on: contracts/traits, iterables, module parameters, destructors (advanced cases)
- The `.tuff` files represent a **vision** for Tuff's standard library; implementing them would require both language features AND the std lib code itself to work correctly
