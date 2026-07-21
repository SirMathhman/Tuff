# Tuff Language - Missing Features Roadmap

Freestanding language features only (no stdlib).

## Phase 1: Foundational

Core building blocks that enable everything else.

1. **String Literals & String Type** - `"hello"` syntax, `+` concatenation, `len` property
2. **Char Literals** - `'a'`, `'\n'`, `'\u{1F600}'`
3. **Byte Literals** - `b'A'`, `b"hello"`
4. **Enum Types** - `enum Color { Red, Green, Blue }` with discriminants
5. **Pattern Matching** - `match` expressions for exhaustive matching on enums/structs
6. **Null/Option Types** - `Option<T>` with `Some(x)` / `None`
7. **Result Type** - `Result<T, E>` with `Ok(x)` / `Err(e)`
8. **Type Aliases** - `type MyInt = U32`
9. **Generics** - `fn identity<T>(x: T) => x`
10. **Traits/Interfaces** - `trait Drawable { fn draw() }` with `impl Drawable for Circle`

## Phase 2: Expressiveness

Operators and control flow for idiomatic code.

11. **Bitwise Operators** - `&`, `|`, `^`, `~`, `<<`, `>>`
12. **Increment/Decrement** - `x++`, `x--`, `++x`, `--x`
13. **Ternary Operator** - `cond ? a : b`
14. **Spread/Rest** - `[...arr, x]`, `fn f(...args)`
15. **Default Parameters** - `fn f(x: I32 = 0)`
16. **Method Syntax** - `obj.method()` instead of `method(obj)`
17. **Operator Overloading** - Custom `+`, `-` via traits
18. **Range Expressions** - `0..10`, `0..=10` (inclusive)
19. **For Loops** - `for x in arr` and `for i in 0..10` range syntax
20. **Continue/Break** - Loop control statements
21. **Return Statement** - Early return from functions
22. **Try Operator** - `?` for Result/Option propagation
23. **Defer** - `defer cleanup()` for scoped cleanup
24. **Labels & Goto** - `break 'label`, `continue 'label` for nested loops

## Phase 3: Structure

Code organization and advanced type system.

25. **Modules** - `module mymod { ... }`
26. **Imports** - `use mymod::foo`
27. **Visibility** - `pub` / private modifiers
28. **Re-exports** - `pub use mymod::foo`
29. **Const Generics** - `Array<T, N>` with compile-time size
30. **Associated Types** - `trait Iterator { type Item; }`
31. **Union Types** - `type Either = A | B` (sum types)
32. **Lifetime Annotations** - `'a` for borrow checking
33. **Variance** - Covariant/contravariant type parameters
34. **Zero-Sized Types** - `enum Void {}` (uninhabited)
35. **Phantom Data** - Marker types for variance
36. **Type Inference** - Hindley-Milner or local inference

## Phase 4: Advanced

Metaprogramming, ownership, concurrency, and interop.

37. **Macros** - `macro_rules!` or procedural macros
38. **Attributes** - `#[derive(Debug)]`, `#[repr(C)]`
39. **Raw Identifiers** - `r#type` for reserved words
40. **Multi-line Strings** - `r#"..."#`
41. **Box/Heap Allocation** - `Box<T>` for heap-allocated values
42. **Rc** - Reference counting for shared ownership
43. **Move Semantics** - Explicit ownership transfer (beyond closures)
44. **Drop/Dispose** - `fn drop()` called on scope exit
45. **Async/Await** - `async fn` and `await` expressions
46. **Futures** - `Future<T>` trait and combinators
47. **Channels** - `chan<T>` for message passing
48. **Mutex/RwLock** - Thread-safe containers (type-level, not stdlib)
49. **FFI** - `extern "C" fn foo()` for C interop
50. **Inline Assembly** - `asm!("mov eax, ebx")` for low-level ops
