# Tuff Language Specification (Draft)

This document outlines the syntax, type system, and core features of the Tuff programming language, as defined for the Stage 0 bootstrap compiler.

## 1. General Principles

- **Influences**: Rust (safety, keywords), TypeScript (syntax, unions), Kotlin (ergonomics, nullability).
- **Casing**:
  - **Types**: `PascalCase` (e.g., `I32`, `MyStruct`).
  - **Identifiers**: `camelCase` (e.g., `myVariable`, `calculateValue`).
- **Expressions**: Most constructs (blocks, `if` statements) are expressions that return values. Blocks `{ ... }` evaluate to their last expression or an explicit `yield`.
- **Top-Level Statements**: Programs can consist of top-level statements; no `main` function is required.
- **Iterators**: Tuff prefers functional-style iteration via iterators (e.g., `list.iter().sum()`) over traditional `for` loops.
- **Comments**:
  - Single-line: `// comment`
  - Multi-line: `/* comment */`

## 2. Type System

### 2.1 Primitives

Fixed-width types for predictable behavior across JS and LLVM targets:

- **Integers**: `I8`, `I16`, `I32`, `I64`, `U8`, `U16`, `U32`, `U64`, `ISize`, `USize`.
- **Floats**: `F32`, `F64`.
- **Boolean**: `Bool`.
- **Void**: `Void` (Type for empty blocks or functions that return nothing).

### 2.2 Arrays

- **Type**: `Array<T>`.
- **Literal**: `[1, 2, 3]`.
- **Access**: `arr[0]`.

### 2.3 NativeString

- **Type**: `NativeString`.
- **Declaration**: `extern intrinsic type NativeString;`.
- **Behavior**: All double-quoted literals (`"hello"`) are of type `NativeString`. It maps to native strings in JS and `char*` (or similar) in C/LLVM.

### 2.4 Union Types & Aliases

- **Syntax**: `type Name = TypeA | TypeB;`.
- **Type Inspection**: The `is` keyword checks the variant of a union at runtime.
  - Example: `if (value is Some<I32>) { ... }`.

### 2.5 Literals & Constants

- **Booleans**: `true`, `false`.
- **Numbers**:
  - Decimal: `123`, `1_000_000`.
  - Float: `3.14`.

### 2.6 Operators

- **Arithmetic**: `+`, `-`, `*`, `/`, `%`.
- **Comparison**: `==`, `!=`, `<`, `>`, `<=`, `>=`.
- **Logical**: `&&`, `||`, `!`.
- **Bitwise**: `&`, `|`, `^`, `<<`, `>>`.
- **Assignment**: `=`, `+=`, `-=`, `*=`, `/=`.

## 3. Variables & Memory

### 3.1 Declaration

- **Immutable**: `let x: I32 = 10;`.
- **Mutable**: `let mut y: I32 = 20;`.
- **Visibility**: Values are private by default. The `out` keyword is used to make a declaration public.
  - Example: `out let myConst = 100;`
  - Note: There are no `private`, `protected`, or `pub` keywords.

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

- **While Loop**:

  ```rust
  while (condition) {
      // ...
  }
  ```

### 4.3 Top-Level Statements

Tuff supports top-level statements. A program does not require a `main` function. The last expression in the top-level scope of the entry file determines the program's exit code.

Example:

```rust
let x = 100;
x // Program exits with code 100
```

### 4.4 Blocks as Expressions

In Tuff, blocks `{ ... }` are expressions. The right-hand side of the `=>` operator in a function definition is always an expression.

- **Yielding**: The `yield` keyword explicitly returns a value from a block.
- **Implicit Yield**: If the last statement in a block is an expression, it is implicitly yielded. A semicolon is **not** required for the last expression to be yielded.
- **Void Blocks**: Empty blocks `{}` or blocks that do not yield a value (e.g., only contain statements like assignments) have the type `Void`. Standalone blocks are allowed but are not considered expressions in that context.

Example:

```rust
let a = 100;
let b = 200;

// Explicit yield in a block expression
let z1 = {
    yield a + b;
};

// Implicit yield (no semicolon required for the yielded expression)
let z2 = {
    a + b
};

// Standalone block (Void type, not an expression)
let mut x = 100;
{
    x = 200;
}
```

This is why `fn add(a: I32, b: I32): I32 => { a + b }` is valid; the block itself is the expression on the RHS of `=>`.

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

## 6. Module System

- **Imports**: `from namespace::child use { Member0 Member1 };`.
- **Packages**: No explicit `package` statement; organization is handled via the file system (Gradle-like).

## 7. Extern & Intrinsic

- **Extern**: Informs the compiler that a symbol is defined externally.
- **Intrinsic**: Informs the compiler that a type or function has special, built-in behavior.
  - Example: `extern intrinsic type NativeString;`.
