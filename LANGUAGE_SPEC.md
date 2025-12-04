# Tuff Language Specification

**Version**: 0.1.0 (Bootstrap)  
**Status**: Specification Phase  
**Compiler Target**: C

## Overview

Tuff is a statically-typed, compiled programming language combining:

- **Rust-style ownership and borrowing** with lexical lifetime scoping
- **Kotlin pragmatism** for concise, readable syntax
- **TypeScript-style type inference** for type variables
- **Formal correctness** inspired by theorem provers

Tuff compiles to C, enabling straightforward compilation to native binaries via existing C compilers. The language features a borrow checker ensuring memory safety at compile time, discriminated unions via `type` definitions, and Rust-style pattern matching.

## 1. Syntax & Grammar (EBNF)

### 1.1 Program Structure

```ebnf
Program         ::= Item*

Item            ::= FunctionDef
                  | TypeDef
                  | ExternBlock

FunctionDef     ::= 'fn' IDENT '(' Parameters? ')' ('->' Type)? Block
Parameters      ::= Parameter (',' Parameter)*
Parameter       ::= IDENT ':' Type

TypeDef         ::= 'type' IDENT ('(' TypeParams ')')? '=' UnionVariants
TypeParams      ::= IDENT (',' IDENT)*
UnionVariants   ::= Variant ('|' Variant)*
Variant         ::= IDENT ('(' Type ')')?

ExternBlock     ::= 'extern' '{' ExternDecl* '}'
ExternDecl      ::= 'fn' IDENT '(' Parameters? ')' ('->' Type)? ';'

Block           ::= '{' Statement* '}'
```

### 1.2 Statements

```ebnf
Statement       ::= LetStmt
                  | AssignStmt
                  | ExprStmt
                  | IfStmt
                  | MatchStmt
                  | LoopStmt
                  | ReturnStmt

LetStmt         ::= 'let' IDENT (':' Type)? ('=' Expr)? ';'
AssignStmt      ::= Expr '=' Expr ';'
ExprStmt        ::= Expr ';'
IfStmt          ::= 'if' Expr Block ('else' Block)?
MatchStmt       ::= 'match' Expr '{' MatchArm+ '}'
MatchArm        ::= Pattern '=>' Block
LoopStmt        ::= 'loop' Block
ReturnStmt      ::= 'return' Expr? ';'
```

### 1.3 Expressions

```ebnf
Expr            ::= BinOpExpr

BinOpExpr       ::= UnaryExpr (BinOp UnaryExpr)*
BinOp           ::= '+' | '-' | '*' | '/' | '%'
                  | '==' | '!=' | '<' | '>' | '<=' | '>='
                  | '&&' | '||'

UnaryExpr       ::= UnaryOp? PostfixExpr
UnaryOp         ::= '-' | '!' | '*' | '&' | '&' 'mut'

PostfixExpr     ::= PrimaryExpr (PostfixOp)*
PostfixOp       ::= FunctionCall | FieldAccess | Deref | Index

FunctionCall    ::= '(' Arguments? ')'
FieldAccess     ::= '.' IDENT
Deref           ::= '.*'
Index           ::= '[' Expr ']'

Arguments       ::= Expr (',' Expr)*

PrimaryExpr     ::= Literal
                  | IDENT
                  | '(' Expr ')'
                  | ConstructorExpr

Literal         ::= NUMBER | STRING | 'true' | 'false'

ConstructorExpr ::= IDENT ConstructorArg?
ConstructorArg  ::= '(' Expr (',' Expr)* ')'
```

### 1.4 Patterns

```ebnf
Pattern         ::= IDENT
                  | '_'
                  | ConstructorPattern

ConstructorPattern ::= IDENT '(' Pattern (',' Pattern)* ')'
```

### 1.5 Types

```ebnf
Type            ::= PrimitiveType
                  | NamedType
                  | ReferenceType
                  | GenericType
                  | FunctionType

PrimitiveType   ::= 'i32' | 'i64' | 'f32' | 'f64' | 'bool' | 'void'

NamedType       ::= IDENT

ReferenceType   ::= '&' 'mut'? Type

GenericType     ::= IDENT '<' Type (',' Type)* '>'

FunctionType    ::= 'fn' '(' Type (',' Type)* ')' '->' Type
```

## 2. Type System

### 2.1 Primitive Types

- `i32`: 32-bit signed integer
- `i64`: 64-bit signed integer
- `f32`: 32-bit floating-point
- `f64`: 64-bit floating-point
- `bool`: boolean (true/false)
- `void`: unit type (no value)

### 2.2 Type Inference

Tuff uses **Hindley-Milner-style type inference** with constraint solving:

1. **Inference Variables**: Unresolved types represented as `?T`
2. **Constraint Generation**: During type checking, constraints are collected
3. **Constraint Solving**: Unification algorithm solves for inference variables
4. **Subsumption Checking**: Inferred types must be consistent with annotations

Example:

```tuff
let x = 42;           // x: i32 (inferred from literal)
let y = x + 1;        // y: i32 (inferred from context)
let f = fn(a) { a };  // f: fn(?T) -> ?T (polymorphic, inferred at call sites)
```

### 2.3 Generic Types

Generics are parameterized by type variables:

```tuff
type Option<T> = Some<T> | None;
type Result<T, E> = Ok<T> | Err<E>;
type Vec<T> = /* stdlib implementation */;
```

Type parameters must be specified at usage sites (no implicit specialization):

```tuff
let opt: Option<i32> = Some(42);
let err: Result<i32, str> = Err("failed");
```

### 2.4 Union Types (Discriminated Unions)

Union types are defined with the `type` keyword:

```tuff
type Option<T> = Some<T> | None;
type Bool = True | False;
type Color = Red | Green | Blue;
```

Union variants are constructed and destructed via pattern matching:

```tuff
let x = Some(42);
match x {
  Some(v) => { /* v: i32 */ }
  None => { /* no value */ }
}
```

## 3. Ownership & Borrowing Model

### 3.1 Ownership Rules

1. **Each value has a single owner**
2. **Ownership transfers on assignment or function call** (move semantics)
3. **Owned values are deallocated when owner goes out of scope**
4. **Copy types (primitives) are automatically copied** rather than moved

### 3.2 Borrowing Rules

1. **Borrowing creates a reference without transferring ownership**
2. **Immutable borrow (`&T`)**: Multiple `&T` references allowed, no mutation
3. **Mutable borrow (`&mut T`)**: At most one `&mut T` reference, no other borrows
4. **Borrow scope**: Reference lifetime is lexically scoped (ends at last use)

### 3.3 Lexical Scoping

Borrow lifetimes are determined by lexical scope (function-scoped):

```tuff
fn example() {
  let mut x = 42;
  let r1 = &x;          // immutable borrow
  let r2 = &x;          // OK: multiple immutable borrows
  // r1, r2 out of scope here

  let m = &mut x;       // mutable borrow
  *m = 100;
  // m out of scope here

  let r3 = &x;          // OK: no conflicting borrows
}
```

### 3.4 Function Parameters

Function parameters can **consume ownership** or **borrow**:

```tuff
fn takes_ownership(x: i32) -> i32 {
  x + 1
}

fn borrows_immutably(x: &i32) -> i32 {
  *x + 1
}

fn borrows_mutably(x: &mut i32) {
  *x = *x + 1;
}
```

**Default behavior**: Owned parameters consume ownership; borrowed parameters do not.

### 3.5 Return Values

Functions can return owned values or references (lifetime must be lexically valid):

```tuff
fn returns_owned() -> i32 {
  42
}

fn returns_reference(x: &i32) -> &i32 {
  x  // OK: reference lifetime is valid
}
```

## 4. Borrow Checker Algorithm

### 4.1 Lifetime Tracking

Each variable has a **lifetime scope** (function-level):

- Variable created at declaration point
- Variable consumed at last use (for owned values)
- Variable remains valid until end of scope (for borrowed values)

### 4.2 Borrow Validation

For each borrow site `&x` or `&mut x`:

1. **Check if `x` is already borrowed mutably**: If yes, error (conflicting borrow)
2. **Check if `&mut x` exists and other borrows remain**: If yes, error (conflicting borrow)
3. **Record borrow**: Track as active borrow until end of lexical scope
4. **Check on reassignment**: Verify no active borrows conflict with new borrow

### 4.3 Move Semantics

On assignment `y = x` (where `x` is not `Copy`):

1. **Transfer ownership** from `x` to `y`
2. **Invalidate `x`**: Subsequent uses of `x` are errors
3. **Check active borrows**: If `x` is borrowed, error (cannot move borrowed value)

## 5. Foreign Function Interface (FFI)

### 5.1 Extern Blocks

Declare C functions via `extern` blocks:

```tuff
extern {
  fn printf(format: &str, ...) -> i32;
  fn malloc(size: i32) -> &mut void;
  fn free(ptr: &mut void);
}
```

### 5.2 FFI Safety

- **No automatic safety checks** on extern calls (caller responsible)
- Tuff assumes extern functions respect borrow semantics
- Unsafe by nature; programmer must ensure correctness

## 6. Code Generation to C

### 6.1 Type Mapping

| Tuff Type | C Type            |
| --------- | ----------------- |
| `i32`     | `int32_t`         |
| `i64`     | `int64_t`         |
| `f32`     | `float`           |
| `f64`     | `double`          |
| `bool`    | `bool` (or `int`) |
| `&T`      | `T*`              |
| `&mut T`  | `T*`              |

### 6.2 Struct Generation

Tuff structs (from union types) compile to C structs with discriminants:

```tuff
type Option<T> = Some<T> | None;
```

Generates:

```c
struct Option_T {
  int tag;  // 0: Some, 1: None
  union {
    T some_value;
  } data;
};
```

### 6.3 Function Generation

Tuff functions compile to C functions with ownership-respecting semantics:

```tuff
fn add(x: i32, y: i32) -> i32 {
  x + y
}
```

Generates:

```c
int32_t add(int32_t x, int32_t y) {
  return x + y;
}
```

## 7. Examples

### 7.1 Simple Function

```tuff
fn main() {
  let x = 42;
  let y = x + 1;
}
```

### 7.2 Ownership & Move

```tuff
fn takes_ownership(x: i32) {
  // x is owned here
}

fn main() {
  let x = 42;
  takes_ownership(x);
  // x is invalid here (ownership transferred)
}
```

### 7.3 Borrowing

```tuff
fn borrow_immutably(x: &i32) -> i32 {
  *x + 1
}

fn main() {
  let x = 42;
  let y = borrow_immutably(&x);
  let z = x + y;  // OK: x is still valid
}
```

### 7.4 Mutable Borrowing

```tuff
fn increment(x: &mut i32) {
  *x = *x + 1;
}

fn main() {
  let mut x = 42;
  increment(&mut x);
  // x is now 43
}
```

### 7.5 Union Types & Pattern Matching

```tuff
type Option<T> = Some<T> | None;

fn unwrap_or(opt: Option<i32>, default: i32) -> i32 {
  match opt {
    Some(v) => v
    None => default
  }
}

fn main() {
  let x = Some(42);
  let y = unwrap_or(x, 0);
}
```

### 7.6 Generics

```tuff
fn identity<T>(x: T) -> T {
  x
}

fn main() {
  let x: i32 = identity(42);
  let y: bool = identity(true);
}
```

### 7.7 FFI & Extern

```tuff
extern {
  fn printf(format: &str) -> i32;
}

fn main() {
  printf("Hello, World!\n");
}
```

### 7.8 Complex Ownership Example

```tuff
fn process(x: &i32) -> i32 {
  let y = *x + 1;
  y
}

fn main() {
  let x = 42;
  let z = process(&x);
  let w = process(&x);  // OK: multiple immutable borrows
}
```

## 8. Scope & Lifetime Rules

### 8.1 Function Scope

All variables are function-scoped:

```tuff
fn example() {
  let x = 1;
  {
    let y = 2;
  }
  // y is out of scope; x is still valid
}
```

### 8.2 Block Scope

Blocks inherit function scope (no nested lifetimes for now):

```tuff
fn example() {
  let x = 1;
  if true {
    let y = 2;
  }
  // y is out of scope; x is still valid
}
```

## 9. Error Categories

### 9.1 Syntax Errors

- Unexpected token or malformed expression
- Example: `let x 42;` (missing `=`)

### 9.2 Type Errors

- Type mismatch in assignment or function call
- Example: `let x: i32 = true;` (expected `i32`, found `bool`)

### 9.3 Borrow Errors

- Multiple mutable borrows or conflicting ownership transfers
- Example: Cannot borrow `x` as mutable twice

### 9.4 Name Resolution Errors

- Undefined variable or function
- Example: `let y = x;` where `x` was never defined

## 10. Reserved Keywords

```
fn, let, mut, type, match, if, else, loop, return, extern, true, false, void
```

## 11. Operators (Priority & Associativity)

| Operator             | Type           | Associativity | Priority    |
| -------------------- | -------------- | ------------- | ----------- |
| `\|\|`               | logical or     | left          | 1 (lowest)  |
| `&&`                 | logical and    | left          | 2           |
| `==`, `!=`           | equality       | left          | 3           |
| `<`, `>`, `<=`, `>=` | comparison     | left          | 4           |
| `+`, `-`             | additive       | left          | 5           |
| `*`, `/`, `%`        | multiplicative | left          | 6           |
| `!`, `-`, `*`, `&`   | unary          | right         | 7 (highest) |

## 12. Compilation Pipeline

```
Source (.tuff)
  → Lexer (tokenization)
  → Parser (AST construction)
  → Type Checker (type inference & validation)
  → Borrow Checker (ownership validation)
  → Semantic Analyzer (name resolution, scoping)
  → Code Generator (Tuff AST → C code)
  → C Output (.c)
  → C Compiler (gcc/clang)
  → Binary Executable
```
