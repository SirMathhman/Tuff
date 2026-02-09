# Tuff Bootstrap Compiler Specification

## Purpose

This document defines the **minimal subset of Tuff** required to implement a self-hosted compiler. The bootstrap strategy is:

1. **Phase 1**: Write a minimal Tuff compiler in C (compiles Tuff → C)
2. **Phase 2**: Rewrite that compiler in minimal Tuff (single file)
3. **Phase 3**: Use the Tuff-in-C compiler to compile the Tuff-in-Tuff compiler
4. **Phase 4**: Gradually add more language features to both compiler and language

The bootstrap Tuff compiler only needs to support features it uses to compile itself. This is a **pragmatic minimal language** - not the full Tuff specification.

---

## Bootstrap Strategy: Compile to C

**Target**: The bootstrap compiler translates Tuff source code to C source code.

**Rationale**: 
- C compiler handles optimization, linking, and platform specifics
- Simple 1:1 mapping for most Tuff constructs
- Allows gradual migration of bootstrap compiler from C to Tuff
- Only need to support features that map cleanly to C

**Non-Goals for Bootstrap**:
- No LLVM backend (deferred)
- No JavaScript backend (deferred)
- No refinement types or compile-time proofs (deferred)
- No borrow checker (deferred)
- No generics (deferred)
- No async/await (deferred)
- No closures (deferred)

---

## Minimal Feature Set

### 1. Type System

#### Primitive Types

**Required**:
```tuff
Bool          → _Bool / stdbool.h bool
I8, I16, I32, I64, I128    → int8_t, int16_t, int32_t, int64_t, __int128
U8, U16, U32, U64, U128    → uint8_t, uint16_t, uint32_t, uint64_t, unsigned __int128
ISize, USize               → intptr_t, uintptr_t / size_t
F32, F64                   → float, double
Char                       → char (or uint32_t for Unicode)
```

**String Types**:
```tuff
*Str          → char* (C string, null-terminated)
```

**Not Required for Bootstrap**:
- Refined types (I32 < 100, I32 != 0, etc.)
- Literal types (5I32, exactly 5)
- Dependent types
- Compile-time strings with known length (Str[N])

#### Composite Types

**Structs**:
```tuff
struct Point {
    x : I32,
    y : I32
}

// Maps to C:
typedef struct Point {
    int32_t x;
    int32_t y;
} Point;
```

**Union Types** (Tagged Unions):
```tuff
struct Some {
    value : I32;
}
struct None {}
type Option = Some | None;

// Maps to C:
typedef enum { TAG_Some, TAG_None } OptionTag;
typedef struct Option {
    OptionTag tag;
    union {
        struct { int32_t value; } Some;
        struct { } None;
    } data;
} Option;
```

**Arrays**:
```tuff
[T; N]        // Fixed-size array → T arr[N]
*[T]          // Dynamic array (pointer + length)
              // Maps to: struct { T* data; size_t length; }
```

**Not Required**:
- Arrays with init/capacity tracking: `[T; Init; Total]`

#### Pointers

```tuff
*T            // Pointer to T → T*
*mut T        // Mutable pointer to T → T*
```

**Semantics**: Simple C-style pointers. No borrow checking in bootstrap.

**Nullable Pointers**:
```tuff
*T | 0        // Nullable pointer
              // Can implement with union or just use C's NULL
```

### 2. Functions

**Definition**:
```tuff
fn add(a : I32, b : I32) : I32 => a + b;

// Block form
fn multiply(a : I32, b : I32) : I32 => {
    a * b
}

// Maps to C:
int32_t add(int32_t a, int32_t b) {
    return a + b;
}
```

**Extension Methods** (No impl blocks):
```tuff
struct Point { x : I32, y : I32 }

fn distance(this : *Point) : F64 => {
    // implementation
}

// Maps to C:
double distance(Point* this) {
    // implementation
}
```

**Not Required**:
- Generics: `fn identity<T>(x : T) : T`
- Closures: `fn outer() : () => Void`
- Async/await
- Contracts/traits
- impl blocks
- `with` keyword

### 3. Variables

```tuff
let x : I32 = 100;
let y = 200;          // Type inference (simple cases only)
```

**Rules**:
- Immutable by default (map to `const` in C where possible)
- No shadowing
- Type inference for literals and simple expressions

**Not Required**:
- Complex type inference with refinements

### 4. Control Flow

**If/Else**:
```tuff
if (condition) {
    // body
} else {
    // body
}

// Direct mapping to C if/else
```

**Loops**:
```tuff
// While loop
while (condition) {
    // body
}

// Infinite loop
loop {
    if (done) break;
}

// For loop (desugar to while)
for (i in 0..10) {
    // body
}
```

**Match Expressions**:
```tuff
match (value) {
    case Some { value } = handleSome(value);
    case None = handleNone();
}

// Maps to C switch on tag + access union
```

**Pattern Matching Features**:
- Destructuring union types
- Variable binding in patterns
- Wildcard `_` pattern
- Basic exhaustiveness checking

**Not Required**:
- Range patterns: `case 0..10`
- Multiple patterns: `case A | B` (can add later if useful)
- Guards: `case Some { value } if value > 0`

### 5. Pattern Matching and Type Tests

**Is Expression**:
```tuff
if (option is Some { value }) {
    // use value
} else {
    // handle None
}
```

**Required for**: Compiler AST traversal and Result/Option handling.

### 6. Operators

**Arithmetic**: `+`, `-`, `*`, `/`, `%`

**Comparison**: `==`, `!=`, `<`, `>`, `<=`, `>=`

**Logical**: `&&`, `||`, `!`

**Not Required**:
- Operator overloading (doesn't exist in full Tuff anyway)
- Checked arithmetic (deferred with refinement types)

### 7. Modules and Files

**Bootstrap**: Single file compiler (no module system initially).

**File I/O**: Access to C's stdio for reading source and writing generated C code.

**Not Required**:
- Package system: `com::meti::Module`
- Multi-file projects
- `let { A, B } = module;` imports

### 8. Comments

```tuff
// Line comment
/* Block comment */

// No doc comments needed for bootstrap
```

### 9. Standard Library (Minimal)

The bootstrap compiler needs these types/functions:

**String Operations**:
```tuff
// String type (wrapper around *Str)
struct String {
    data : *mut U8,
    length : USize
}

// Required operations
fn stringNew() : String;
fn stringFromCStr(s : *Str) : String;
fn stringAppend(s : *mut String, other : *String) : Void;
fn stringCmp(a : *String, b : *String) : I32;
fn stringFree(s : *mut String) : Void;
```

**Dynamic Array (Vec)**:
```tuff
struct Vec {
    data : *mut U8,        // Generic via void* in C
    length : USize,
    capacity : USize,
    elementSize : USize
}

// Required operations
fn vecNew(elementSize : USize) : Vec;
fn vecPush(v : *mut Vec, element : *U8) : Void;
fn vecGet(v : *Vec, index : USize) : *U8;
fn vecLen(v : *Vec) : USize;
fn vecFree(v : *mut Vec) : Void;
```

**HashMap** (Optional - can use linear search in bootstrap):
```tuff
struct HashMap {
    // Implementation details
}

// Operations for symbol table
fn hashMapNew() : HashMap;
fn hashMapInsert(h : *mut HashMap, key : *String, value : *U8) : Void;
fn hashMapGet(h : *HashMap, key : *String) : *U8 | 0;
fn hashMapFree(h : *mut HashMap) : Void;
```

**Result and Option**:
```tuff
struct Some { value : I32; }    // Concrete type, no generics
struct None {}
type Option = Some | None;

struct Ok { value : I32; }      // Concrete type
struct Err { error : *String; }
type Result = Ok | Err;

// For different value types, define new Result types:
// ResultString, ResultBool, etc.
```

**File I/O**:
```tuff
fn fileOpen(path : *Str, mode : *Str) : *File | 0;
fn fileRead(f : *mut File, buffer : *mut U8, size : USize) : USize;
fn fileWrite(f : *mut File, data : *U8, size : USize) : USize;
fn fileClose(f : *mut File) : Void;
```

**Memory**:
```tuff
fn malloc(size : USize) : *mut U8 | 0;
fn free(ptr : *mut U8) : Void;
```

---

## Compiler Architecture (What the Code Needs to Do)

The bootstrap compiler implements these phases:

### 1. Lexer/Tokenizer

**Input**: Tuff source code (string)

**Output**: Token stream

**Required Types**:
```tuff
struct Token {
    kind : TokenKind,
    lexeme : String,
    line : USize,
    column : USize
}

// TokenKind is a union of all token types
struct TokIdent {}
struct TokNumber {}
struct TokString {}
struct TokKeyword { keyword : KeywordKind }
// ... etc
type TokenKind = TokIdent | TokNumber | TokString | TokKeyword | ...;
```

### 2. Parser

**Input**: Token stream

**Output**: Abstract Syntax Tree (AST)

**Required Types**:
```tuff
// AST nodes as union types
struct AstFunctionDecl {
    name : String,
    params : *[AstParam],
    returnType : AstType,
    body : *AstExpr
}

struct AstVarDecl {
    name : String,
    varType : AstType,
    initializer : *AstExpr
}

// ... many more node types

type AstStmt = AstFunctionDecl | AstVarDecl | AstReturn | ...;
type AstExpr = AstBinary | AstUnary | AstCall | AstLiteral | ...;
```

### 3. Type Checker

**Input**: AST

**Output**: Typed AST or type errors

**Required**:
- Symbol table (HashMap from name to type)
- Type representation
- Type compatibility checking (no refinements, just structural equality)

### 4. Code Generator

**Input**: Typed AST

**Output**: C source code (as string)

**Process**:
- Walk AST
- Emit corresponding C code
- Handle name mangling if needed
- Generate type definitions (structs, unions, enums)
- Generate function definitions

---

## Deferred Features (Not in Bootstrap)

The following features from the full Tuff specification are **not** required for bootstrap:

### Type System
- ❌ Refinement types (I32 < 100, I32 != 0)
- ❌ Literal types (5I32)
- ❌ Dependent types
- ❌ Generics
- ❌ Contracts/traits
- ❌ Lifetime annotations and borrow checking
- ❌ Complex type inference

### Language Features
- ❌ Closures and captures
- ❌ Async/await
- ❌ impl blocks (just use extension methods)
- ❌ `with` keyword
- ❌ Operator overloading
- ❌ Compile-time evaluation
- ❌ Metaprogramming/macros
- ❌ Attributes

### Safety Features
- ❌ Compile-time proofs of division by zero
- ❌ Compile-time proofs of array bounds
- ❌ Compile-time proofs of arithmetic overflow
- ❌ Borrow checker

### Compilation Targets
- ❌ LLVM backend
- ❌ JavaScript backend
- ❌ Tuff backend (interpreter)

### Module System
- ❌ Multi-file projects
- ❌ Package system (com::meti::Module)
- ❌ Import statements

### Standard Library
- ❌ Comprehensive collections
- ❌ Networking
- ❌ JSON/serialization
- ❌ Math library
- ❌ Date/time
- ❌ Regex

### Developer Experience
- ❌ Formatter
- ❌ Linter
- ❌ Language server
- ❌ Debugger integration
- ❌ Documentation generator

---

## Bootstrap Language Summary

The minimal Tuff for self-hosting consists of:

✅ **Types**: Primitives (I32, Bool, etc.), structs, tagged unions, pointers, arrays
✅ **Functions**: Plain functions, extension methods
✅ **Variables**: let bindings, simple type inference
✅ **Control Flow**: if/else, while, loop, for (desugared), match, break, continue
✅ **Pattern Matching**: Destructure unions, is-expressions
✅ **Operators**: Arithmetic, comparison, logical
✅ **Comments**: // and /* */
✅ **Standard Library**: String, Vec, HashMap (minimal), File I/O, Result/Option

❌ **Not Included**: Refinements, generics, contracts, closures, async, borrow checking, modules, advanced features

---

## C Code Generation Strategy

### Type Mapping

| Tuff Type | C Type |
|-----------|--------|
| I32 | int32_t |
| Bool | bool (stdbool.h) |
| *T | T* |
| *mut T | T* |
| [T; N] | T[N] |
| *[T] | struct { T* data; size_t length; } |
| A \| B (union) | Tagged union with enum |

### Function Mapping

```tuff
fn add(a : I32, b : I32) : I32 => a + b;
```

Generates:

```c
int32_t add(int32_t a, int32_t b) {
    return a + b;
}
```

### Struct Mapping

```tuff
struct Point { x : I32, y : I32 }
```

Generates:

```c
typedef struct Point {
    int32_t x;
    int32_t y;
} Point;
```

### Union Mapping

```tuff
struct Some { value : I32; }
struct None {}
type Option = Some | None;
```

Generates:

```c
typedef enum { TAG_Some, TAG_None } OptionTag;

typedef struct Option {
    OptionTag tag;
    union {
        struct { int32_t value; } Some;
        struct { } None;
    } data;
} Option;
```

### Match Mapping

```tuff
match (opt) {
    case Some { value } = printf("%d", value);
    case None = printf("none");
}
```

Generates:

```c
switch (opt.tag) {
    case TAG_Some: {
        int32_t value = opt.data.Some.value;
        printf("%d", value);
        break;
    }
    case TAG_None: {
        printf("none");
        break;
    }
}
```

---

## Bootstrap Development Plan

### Phase 1: C Bootstrap Compiler (tuffc-bootstrap)

Write a compiler in C that:
1. Lexes/parses minimal Tuff
2. Type checks (basic, no refinements)
3. Generates C code
4. Invokes C compiler (gcc/clang)

**Deliverable**: `tuffc-bootstrap` (written in C)

### Phase 2: Self-Hosted Compiler (tuffc.tuff)

Rewrite the compiler in minimal Tuff (single file if possible, or minimal files):
1. Port lexer to Tuff
2. Port parser to Tuff
3. Port type checker to Tuff
4. Port code generator to Tuff

**Deliverable**: `tuffc.tuff` (written in minimal Tuff)

### Phase 3: Bootstrap

```bash
# Compile Tuff compiler using C bootstrap
./tuffc-bootstrap tuffc.tuff -o tuffc.c
gcc tuffc.c -o tuffc

# Now tuffc can compile itself
./tuffc tuffc.tuff -o tuffc2.c
gcc tuffc2.c -o tuffc2

# Verify: tuffc and tuffc2 should be equivalent
```

### Phase 4: Iterative Enhancement

Once self-hosted:
1. Add generics
2. Add refinement types
3. Add borrow checker
4. Add LLVM backend
5. Add JavaScript backend
6. Add contracts
7. Add closures
8. Add async/await
9. Add module system
10. Optimize compiler

---

## Testing Strategy

### Compiler Tests

**Unit Tests**: Test each phase independently
- Lexer: token stream correctness
- Parser: AST correctness
- Type checker: error detection
- Code generator: valid C output

**Integration Tests**: End-to-end compilation
- Compile simple programs
- Verify generated C compiles
- Verify executable runs correctly

### Self-Hosting Validation

**Test**: Compile the compiler with itself multiple times.

```bash
# Generation 0: C bootstrap
./tuffc-bootstrap tuffc.tuff -o tuffc0.c
gcc tuffc0.c -o tuffc0

# Generation 1: First self-compile
./tuffc0 tuffc.tuff -o tuffc1.c
gcc tuffc1.c -o tuffc1

# Generation 2: Second self-compile
./tuffc1 tuffc.tuff -o tuffc2.c
gcc tuffc2.c -o tuffc2

# Verify: tuffc1.c and tuffc2.c should be identical (or produce equivalent executables)
diff tuffc1.c tuffc2.c
```

**Success Criteria**: The compiler stabilizes (produces identical output when compiling itself).

---

## Test Programs for Bootstrap

Once bootstrap compiler works, it should compile these programs:

### 1. Hello World

```tuff
fn main() : Void => {
    printf("Hello, Tuff!\n");
}
```

### 2. Fibonacci

```tuff
fn fib(n : I32) : I32 => {
    if (n <= 1) {
        n
    } else {
        fib(n - 1) + fib(n - 2)
    }
}

fn main() : Void => {
    let result = fib(10);
    printf("fib(10) = %d\n", result);
}
```

### 3. Option Type Usage

```tuff
struct Some { value : I32; }
struct None {}
type Option = Some | None;

fn divide(a : I32, b : I32) : Option => {
    if (b == 0) {
        None {}
    } else {
        Some { value : a / b }
    }
}

fn main() : Void => {
    let result = divide(10, 2);
    match (result) {
        case Some { value } = printf("Result: %d\n", value);
        case None = printf("Division by zero\n");
    }
}
```

### 4. Struct with Methods

```tuff
struct Point {
    x : I32,
    y : I32
}

fn distanceSquared(this : *Point) : I32 => {
    this.x * this.x + this.y * this.y
}

fn main() : Void => {
    let p = Point { x : 3, y : 4 };
    let dist = distanceSquared(*p);
    printf("Distance squared: %d\n", dist);
}
```

---

## Success Criteria

The bootstrap is complete when:

1. ✅ `tuffc-bootstrap` (written in C) can compile `tuffc.tuff` to C
2. ✅ `tuffc` (compiled from Tuff) can compile itself
3. ✅ The compiler stabilizes (generation N and N+1 produce identical output)
4. ✅ All test programs compile and run correctly
5. ✅ The compiler passes all unit and integration tests

At this point, Tuff is **self-hosted** and ready for incremental enhancement.

---

**End of Bootstrap Specification**
