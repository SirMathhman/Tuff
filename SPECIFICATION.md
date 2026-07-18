# Tuff Language Specification

## 1. Purpose and Scope

Tuff is a systems programming language designed for experienced C/C++ developers that eliminates undefined behavior through compile-time safety guarantees. The language provides low-level control and performance while enforcing memory safety through an ownership and borrowing system.

**Core Design Principles:**
- Zero undefined behavior (except FFI boundaries)
- Ownership and borrowing for memory safety
- Modern C-like syntax with familiar constructs
- Freestanding design (language core separate from libraries)
- Cross-platform compilation (Windows, Linux, macOS, WebAssembly, Embedded)

**Target Audience:** Experienced C/C++ developers seeking a safer systems programming language without sacrificing control or performance.

---

## 2. Domain Model

### 2.1 Entities

#### 2.1.1 Primitive Types

| Type | Description | Size |
|------|-------------|------|
| `U8` | Unsigned 8-bit integer | 1 byte |
| `U16` | Unsigned 16-bit integer | 2 bytes |
| `U32` | Unsigned 32-bit integer | 4 bytes |
| `U64` | Unsigned 64-bit integer | 8 bytes |
| `I8` | Signed 8-bit integer | 1 byte |
| `I16` | Signed 16-bit integer | 2 bytes |
| `I32` | Signed 32-bit integer | 4 bytes |
| `I64` | Signed 64-bit integer | 8 bytes |
| `F32` | 32-bit floating-point | 4 bytes |
| `F64` | 64-bit floating-point | 8 bytes |
| `Bool` | Boolean value | 1 byte |
| `Char` | UTF-8 byte | 1 byte |
| `Null` | Null type (bottom type) | 0 bytes |
| `Void` | Unit type (no value) | 0 bytes |

#### 2.1.2 String Types

| Type | Description |
|------|-------------|
| `&Str` | Borrowed string slice (pointer + runtime length) |
| `&Str<Length>` | Borrowed string with compile-time known length |
| `String<Length>` | Owned string with compile-time known length |
| `&String<Length>` | Reference to owned string with known length |
| `String` | Dynamic string (owned, runtime length) |

The `String` type is defined as:
```tuff
struct String {
    field : Vec<U8>
} then dropString;
```

String literals (`"hello"`) have type `&Str`.

#### 2.1.3 Composite Types

- **Structs**: Named aggregates of fields
- **Enums**: C-style enumerations (implicit `I32` underlying type)
- **Unions**: Named type unions with pattern matching
- **Arrays**: Fixed-size arrays (`[Type; Length]`) and array literals
- **Slices**: Fat pointers to arrays (`&[Type]` or `&[Type; Length]`)
- **Function Pointers**: `&(ParamTypes) => ReturnType`
- **Generics**: Parametric types with monomorphization

#### 2.1.4 Type Aliases

```tuff
type AliasName<T> = Container<T>;
```

Type aliases may be generic and support the same syntax as struct type parameters.

### 2.2 Relationships

- **Ownership**: Each value has exactly one owner
- **Borrowing**: References (`&T`, `&mut T`) borrow from owners
- **Unions**: Type unions combine multiple types into one (`type Name = A | B`)
- **Null**: The `Null` type may be unioned with pointer types to create nullable types
- **Droppable**: Types with cleanup functions run on scope exit (`type T = Type then fn;`)

### 2.3 State Transitions

- **Values**: Created → Owned → Moved → Dropped
- **References**: Borrowed → Used → Released (on scope exit)
- **Mutability**: Immutable by default; `mut` keyword enables mutation
- **Scope**: Values enter scope on declaration, exit scope on block end

---

## 3. Functional Requirements

### 3.1 User Actions

#### 3.1.1 Variable Declarations

```tuff
let x = expression;          // Immutable binding
let mut x = expression;      // Mutable binding
```

Type inference occurs from the right-hand side expression. Explicit type annotations may be added:
```tuff
let x : I32 = 42;
```

#### 3.1.2 Function Declarations

All functions use the `=>` operator to separate the return type from the function body:

```tuff
fn name(param1 : Type1, param2 : Type2) : ReturnType => body;
```

The body may be a single expression or a block:
```tuff
fn add(a : I32, b : I32) : I32 => a + b;

fn complex(x : I32) : I32 => {
    let y = x * 2;
    return y + 1;
}
```

Functions may use explicit `return` or implicit returns (last expression in block).

**Associated Functions**: Functions with a `this` parameter act as methods on the parameter type:
```tuff
fn addOne(this : I32) : I32 => this + 1;
fn manhattan(this : &Point) : I32 => this.x + this.y;
```

#### 3.1.3 Struct Declarations

```tuff
struct Name {
    field1 : Type1,
    mut field2 : Type2,
}
```

Struct construction:
```tuff
let instance = Name { field1: value1, field2: value2 };
```

Field access:
```tuff
instance.field1
```

Field mutability requires both the binding and the field to be mutable:
```tuff
struct Wrapper {
    mut field : I32
}
let mut instance : Wrapper = Wrapper { field: 100 };
instance.field = 0;
```

#### 3.1.4 Enum Declarations

```tuff
enum Name {
    Variant1,
    Variant2,
    Variant3,
}
```

Enums have an implicit `I32` underlying type. Variants are accessed as:
```tuff
let x = Name.Variant1;
```

#### 3.1.5 Union Type Declarations

```tuff
type Name = TypeA | TypeB;
type NullablePtr<T> = &T | Null;
```

Unions may be used inline or as named aliases.

#### 3.1.6 Array Declarations

```tuff
// Array literal
let arr = [1, 2, 3];

// Repeated value
let arr = [0; 10];
```

Array access:
```tuff
arr[index]
```

Array pointers with runtime length:
```tuff
let ptr : &[I32] = &arr;
ptr.length  // Access runtime length
```

#### 3.1.7 Function Pointers

```tuff
let fn_ptr : &(I32, I32) => I32 = &add;
let result = fn_ptr(1, 2);
```

Function pointer types use `=>` to separate parameters from return type, matching the function declaration syntax.

#### 3.1.8 Generics

```tuff
struct Wrapper<T : Constraint> {
    field : T
}
```

Generics use monomorphization with lazy code generation. The `:` constraint syntax specifies type requirements (details TBD).

#### 3.1.9 Program Entry Point

```tuff
fn main(args : &[&Str]) : I32 => {
    // Program logic
    return 0;
}
```

The `main` function receives command-line arguments as an array of string references and returns an exit code.

### 3.2 Expected Behaviors

#### 3.2.1 Ownership Rules

1. Each value has exactly one owner
2. Multiple immutable references (`&T`) may exist simultaneously
3. Only one mutable reference (`&mut T`) may exist at a time
4. Values are dropped when their owner goes out of scope
5. Values move by default on assignment (no implicit copies)

#### 3.2.2 Reference Semantics

- **Address-of**: `&x` produces a reference to `x`
- **Dereference**: `*ref` dereferences a reference
- **Binding**: `&` has loose binding: `&x + 1` means `(&x) + 1`
- **Lifetimes**: Lexical scoping determines reference validity (no NLL)

#### 3.2.3 Type Checking

- **Type operator**: `if (x is Type { field }) { }` checks type and extracts fields
- Works with any struct/union type
- Narrows type within the if-block scope

#### 3.2.4 Pattern Matching

```tuff
match (expression) {
    case TypeA => { /* block */ },
    case TypeB => { /* block */ },
    case _ => { /* catch-all */ },
}
```

- Match is an expression (returns a value)
- Exhaustive matching is required (all variants must be covered)
- Each case uses block syntax with braces
- Wildcard `_` case may be used for non-exhaustive coverage

#### 3.2.5 Error Handling

Result types are defined as unions:
```tuff
type Result<T, E> = Ok<T> | Err<E>;

struct Ok<T> {
    field : T
}

struct Err<E> {
    field : E
}
```

Error handling via pattern matching:
```tuff
if (result is Ok { field }) {
    // Use narrowed field
} else {
    // Handle error
}
```

#### 3.2.6 Cleanup Functions

```tuff
type Box<T> = &T then free;
```

The `then` keyword attaches a cleanup function that runs on scope exit. No explicit `drop` call is needed.

### 3.3 Business Rules

#### 3.3.1 Validation Rules

- All variables must be declared with `let`
- Semicolons are required after statements
- Match expressions must be exhaustive
- References must not outlive their referents
- Mutable and immutable references cannot coexist
- No raw pointers or pointer arithmetic
- No function overloading (each function has a unique name)

#### 3.3.2 Type System Rules

- Strict typing with local inference
- No implicit type conversions (explicit casts via `as`)
- Integer overflow behavior is unspecified (MVP)
- Operator precedence follows C conventions
- No operator overloading

#### 3.3.3 Memory Rules

- Stack-only allocation (MVP)
- No built-in heap allocation
- Values dropped on scope exit
- Cleanup functions run on scope exit
- Automatic memory layout (compiler decides)

### 3.4 Workflows

#### 3.4.1 Module System

```tuff
// Import members from module via destructuring
let { member0, member1 } = "path/to/module";

// Export items from module
out fn exportedFunction() : Void => ...;
out struct ExportedStruct { field : I32 };
```

Modules are file-based: file paths correspond to module paths. Fully qualified names use `::` notation:
```tuff
path::to::Type { field }
```

#### 3.4.2 FFI

```tuff
// Declare external functions
extern fn malloc(...) : ...;
extern fn free(...) : Void;

// Import from external library
let { extern malloc, extern free } = extern stdlib;
```

FFI calls are the only source of potential undefined behavior.



---

## 4. Edge Cases and Error Handling

### 4.1 Failure Modes

| Scenario | Behavior |
|----------|----------|
| Missing match case | Compile-time error (exhaustiveness check) |
| Use of moved value | Compile-time error (ownership violation) |
| Mutable + immutable refs | Compile-time error (borrow checker) |
| Reference outlives referent | Compile-time error (lifetime check) |
| Array index out of bounds | Runtime error (bounds checking) |
| Null dereference | Compile-time error (Null type must be handled via union) |
| Type mismatch | Compile-time error (strict typing) |
| Integer overflow | Unspecified (MVP) |

### 4.2 Boundary Conditions

- Empty ranges: `3..3` produces an empty iterator
- Empty arrays: `[Type; 0]` is valid
- Zero-length strings: Valid `&Str` with length 0
- Nested unions: Supported via recursive type definitions
- Recursive functions: No special declaration needed

---

## 5. Non-Functional Requirements

### 5.1 Performance

- Compile-time ownership and borrow checking
- Monomorphized generics (zero-cost abstraction)
- No runtime type information overhead (except fat pointers)
- Incremental compilation support

### 5.2 Scalability

- Modular compilation units
- Lazy generic instantiation
- File-based module system

### 5.3 Security

- No undefined behavior (except FFI)
- No raw pointers or pointer arithmetic
- Compile-time memory safety guarantees
- Bounds-checked array access

### 5.4 Compatibility

- Cross-platform: Windows, Linux, macOS, WebAssembly, Embedded
- C-style syntax familiarity
- FFI support for existing C libraries

### 5.5 Accessibility

- Clear error messages for ownership/borrow violations
- Familiar syntax for C/C++ developers
- Explicit type system with helpful inference

---

## 6. Data Requirements

### 6.1 Input Formats

- Source files: `.tuff` extension
- String literals: Double-quoted (`"hello"`)
- Numeric literals: Decimal, hexadecimal (`0x`), octal (`0o`), binary (`0b`), with underscores (`1_000`)
- Boolean literals: `true`, `false`
- Null literal: `null`

### 6.2 Output Formats

- Native machine code (AOT compilation)
- WebAssembly (Wasm)
- Platform-specific binaries

### 6.3 Storage Requirements

- Stack-allocated values
- Module-based organization
- File-based source structure

---

## 7. External Dependencies

### 7.1 FFI

- External C libraries via `extern` declarations
- Library linking (build system responsibility)
- `stdlib` imports for common C functions

### 7.2 Build System

- Incremental compilation
- Dependency tracking
- Linker integration (external responsibility)

---

## 8. Constraints and Assumptions

### 8.1 Technical Constraints

- No standard library bundled (freestanding)
- Stack-only memory allocation (MVP)
- No heap allocation primitives
- No non-lexical lifetimes (NLL)
- No function overloading
- No macros or metaprogramming
- No operator overloading
- No custom operators

### 8.2 Business Constraints

- MVP scope: Core language features only
- Target: Experienced C/C++ developers
- Priority: Safety over convenience
- Syntax: Modern C-like familiarity

### 8.3 Assumptions

- Users understand ownership/borrowing concepts
- Build system handles linking and packaging
- Standard library provided separately
- Integer overflow behavior to be specified in future versions

---

## 9. Acceptance Criteria

### 9.1 Language Core

- [ ] Compiler rejects all code with potential undefined behavior
- [ ] Ownership and borrow checker enforces memory safety rules
- [ ] Type inference works for local variable declarations
- [ ] Generics monomorphize correctly with lazy generation
- [ ] Match expressions enforce exhaustiveness

### 9.2 Type System

- [ ] All primitive types compile to correct sizes
- [ ] Union types support pattern matching
- [ ] Function pointers type-check correctly
- [ ] Array bounds are checked at runtime
- [ ] String types distinguish between borrowed and owned

### 9.3 Memory Safety

- [ ] No raw pointers or pointer arithmetic
- [ ] References cannot outlive referents
- [ ] Mutable and immutable references cannot coexist
- [ ] Values are dropped on scope exit
- [ ] Cleanup functions run on scope exit

### 9.4 Compilation

- [ ] Incremental compilation works correctly
- [ ] Cross-platform targets are supported
- [ ] FFI declarations compile to correct calling conventions
- [ ] Module imports resolve correctly

---

## 10. Open Questions

### 10.1 Deferred Features

1. **Heap allocation**: No built-in heap allocation in MVP
2. **Concurrency**: Basic threading model TBD
3. **Integer overflow**: Behavior unspecified for MVP
4. **Linking**: Build system responsibility, details TBD
5. **Standard library**: Provided separately, not bundled

### 10.2 Future Considerations

1. Trait system (would enable `?` operator)
2. Non-lexical lifetimes (NLL)
3. Function overloading
4. Macros/metaprogramming
5. Operator overloading
6. Custom operators
7. Unsafe blocks (if needed for advanced use cases)

---

## Appendix A: Syntax Reference

### A.1 Keywords

`let`, `mut`, `fn`, `struct`, `enum`, `type`, `match`, `case`, `if`, `else`, `while`, `for`, `in`, `return`, `out`, `extern`, `then`, `is`, `as`, `true`, `false`, `null`, `Void`, `Ok`, `Err`

### A.2 Operators

| Operator | Description |
|----------|-------------|
| `+`, `-`, `*`, `/`, `%` | Arithmetic |
| `==`, `!=`, `<`, `>`, `<=`, `>=` | Comparison |
| `&&`, `\|\|`, `!` | Logical |
| `+=`, `-=`, `*=`, `/=`, `%=` | Compound assignment |
| `&` | Address-of / Reference |
| `*` | Dereference |
| `.` | Field access |
| `->` | Not used (dot auto-dereferences) |
| `[]` | Array indexing |
| `..` | Range (exclusive end) |
| `::` | Namespace separator |
| `:` | Type annotation |
| `=>` | Function body separator (required), Match arm |
| `\|` | Union type separator |

### A.3 Literals

| Literal | Type |
|---------|------|
| `42`, `0x7B`, `0o52`, `0b101010` | Integer |
| `3.14`, `1.0e-5` | Float |
| `'a'` | Char |
| `"hello"` | `&Str` |
| `true`, `false` | `Bool` |
| `null` | `Null` |

### A.4 Punctuation

- `{ }`: Blocks, struct construction, match arms
- `( )`: Function parameters, match expressions
- `[ ]`: Array literals, indexing
- `< >`: Generic type parameters
- `;`: Statement terminator
- `,`: Parameter/field separator
- `=>`: **Required** function body separator (after return type)

---

## Appendix B: Example Programs

### B.1 Hello World

```tuff
fn main(args : &[&Str]) : I32 => {
    // Print hello world (via FFI or stdlib)
    return 0;
}
```

### B.2 Ownership Example

```tuff
struct Point {
    mut x : I32,
    mut y : I32,
}

fn main(args : &[&Str]) : I32 => {
    let mut p = Point { x: 0, y: 0 };
    let ref1 : &Point = &p;
    // let ref2 : &mut Point = &mut p; // Error! Immutable ref exists
    
    p.x = 10; // Error! Immutable ref exists
    return 0;
}
```

### B.3 Union Pattern Matching

```tuff
type Result<T, E> = Ok<T> | Err<E>;

struct Ok<T> {
    field : T
}

struct Err<E> {
    field : E
}

fn divide(a : I32, b : I32) : Result<I32, I32> => {
    if (b == 0) {
        return Err<E> { field: -1 };
    }
    return Ok<T> { field: a / b };
}

fn main(args : &[&Str]) : I32 => {
    let result = divide(10, 2);
    
    if (result is Ok { field }) {
        // Use field (the result)
    } else {
        // Handle error
    }
    return 0;
}
```

### B.4 Generics Example

```tuff
struct Wrapper<T> {
    field : T
}

fn main(args : &[&Str]) : I32 => {
    let w = Wrapper<I32> { field: 42 };
    return 0;
}
```
