# Tuff Language Specification (Draft)

This document outlines the syntax, type system, and core features of the Tuff programming language, as defined for the Stage 0 bootstrap compiler.

## 1. General Principles

- **Influences**: Rust (safety, keywords), TypeScript (syntax, unions), Kotlin (ergonomics, nullability).
- **Casing**:
  - **Types**: `PascalCase` (e.g., `I32`, `MyStruct`).
  - **Identifiers**: `camelCase` (e.g., `myVariable`, `calculateValue`).
- **Expressions**: Most constructs (blocks, `if` statements) are expressions that return values.

## 2. Type System

### 2.1 Primitives

Fixed-width types for predictable behavior across JS and LLVM targets:

- **Integers**: `I8`, `I16`, `I32`, `I64`, `U8`, `U16`, `U32`, `U64`, `ISize`, `USize`.
- **Floats**: `F32`, `F64`.
- **Boolean**: `Bool`.

### 2.2 NativeString

- **Type**: `NativeString`.
- **Declaration**: `extern intrinsic type NativeString;`.
- **Behavior**: All double-quoted literals (`"hello"`) are of type `NativeString`. It maps to native strings in JS and `char*` (or similar) in C/LLVM.

### 2.3 Union Types & Aliases

- **Syntax**: `type Name = TypeA | TypeB;`.
- **Type Inspection**: The `is` keyword checks the variant of a union at runtime.
  - Example: `if (value is Some<I32>) { ... }`.

### 2.4 Option Type

Implemented as a union of structs:

```rust
struct Some<T> { value: T }
struct None<T> {}
type Option<T> = Some<T> | None<T>;
```

## 3. Variables & Memory

### 3.1 Declaration

- **Immutable**: `let x: I32 = 10;`.
- **Mutable**: `let mut y: I32 = 20;`.

### 3.2 Memory Model

- **Stage 0**: Managed references (JS-style).
- **Stage 2+**: Ownership and borrowing (Rust-style). _Note: Pointers and explicit borrowing are excluded from the Stage 0 bootstrap to reduce complexity._

## 4. Functions & Control Flow

### 4.1 Functions

- **Syntax**: `fn name(param: Type): ReturnType => { ... }`.
- **Return Value**: The `yield` keyword is used to produce a value from a block or function. However, Tuff supports several concise variations:
  - **Full Block**: `fn add(a: I32, b: I32): I32 => { yield a + b; }`
  - **Implicit Block Yield**: `fn add(a: I32, b: I32): I32 => { a + b }` (Last expression is yielded)
  - **Expression Body**: `fn add(a: I32, b: I32): I32 => a + b;`
  - **Inferred Expression Body**: `fn add(a: I32, b: I32) => a + b;`

### 4.2 Control Flow

- **If Expression**:
  ```rust
  let result = if (condition) {
      yield 1;
  } else {
      yield 0;
  };
  ```

## 5. Data Structures

### 5.1 Structs & Impl

- **Struct**: Data definition.
  ```rust
  struct Point { x: I32, y: I32 }
  ```
- **Impl**: Behavior definition.
  ```rust
  impl Point {
      fn new(x: I32, y: I32): Point => {
          yield Point { x: x, y: y };
      }
  }
  ```

### 5.2 Class Functions

A hybrid constructor-like syntax:

```rust
class fn Point(x: I32, y: I32) => {
    // Encapsulated state and methods
}
```

### 5.3 Traits

Define shared behavior:

```rust
trait Drawable {
    fn draw(self);
}
```

## 6. Module System

- **Imports**: `from namespace::child use { Member0 Member1 };`.
- **Packages**: No explicit `package` statement; organization is handled via the file system (Gradle-like).

## 7. Extern & Intrinsic

- **Extern**: Informs the compiler that a symbol is defined externally.
- **Intrinsic**: Informs the compiler that a type or function has special, built-in behavior.
  - Example: `extern intrinsic type NativeString;`.
