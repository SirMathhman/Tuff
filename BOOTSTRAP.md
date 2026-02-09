# Tuff Bootstrap Compiler Specification

## Purpose

This document defines the **minimal subset of Tuff** required to implement a self-hosted compiler.

**Bootstrap Strategy**: Incremental migration from C to Tuff without a "big bang" rewrite.

1. Write bootstrap compiler `tuffc` in C (compiles Tuff → C + header files)
2. Create `lib.tuff` with utility functions (String, Vec, parsing utilities, etc.)
3. Compile `lib.tuff` → `lib.c` + `lib.h` using the bootstrap
4. Link the C bootstrap with the generated Tuff library
5. **Incrementally** replace C functions in bootstrap with Tuff equivalents
6. Repeat: Write more in Tuff, compile, link, replace more C code
7. Eventually, the entire compiler is in Tuff

This **avoids phases** - the compiler continuously uses itself to build its own components.

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

**Output**:

- C source file (`.c`)
- C header file (`.h`)

**Critical Requirement**: Must generate header files so Tuff code can be linked with C code during incremental migration.

**Process**:

- Walk AST
- Emit corresponding C code to `.c` file
- Emit function declarations, type definitions, and extern declarations to `.h` file
- Handle name mangling if needed
- Generate type definitions (structs, unions, enums)

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
✅ **Comments**: // and /\* \*/
✅ **Standard Library**: String, Vec, HashMap (minimal), File I/O, Result/Option

❌ **Not Included**: Refinements, generics, contracts, closures, async, borrow checking, modules, advanced features

---

## C Code Generation Strategy

### Type Mapping

| Tuff Type      | C Type                              |
| -------------- | ----------------------------------- |
| I32            | int32_t                             |
| Bool           | bool (stdbool.h)                    |
| \*T            | T\*                                 |
| \*mut T        | T\*                                 |
| [T; N]         | T[N]                                |
| \*[T]          | struct { T\* data; size_t length; } |
| A \| B (union) | Tagged union with enum              |

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

### Step 1: Initial C Bootstrap Compiler

Write a minimal compiler in C (`tuffc.c`) that:

1. Lexes/parses minimal Tuff
2. Type checks (basic, no refinements)
3. Generates C source (.c) and header (.h) files
4. Handles extern declarations for linking with C code

**Deliverable**: `tuffc` executable (compiled from C)

**Key Feature**: Must generate both `.c` and `.h` files so Tuff code can be linked with C code.

### Step 2: Create Tuff Utility Library

Write `lib.tuff` with foundational utilities:

```tuff
// String operations
struct String { data : *mut U8, length : USize, capacity : USize }
fn stringNew() : String => { ... }
fn stringAppend(s : *mut String, ch : U8) : Void => { ... }

// Dynamic array
struct Vec { data : *mut U8, length : USize, capacity : USize, elementSize : USize }
fn vecNew(elementSize : USize) : Vec => { ... }
fn vecPush(v : *mut Vec, element : *U8) : Void => { ... }

// Parser utilities, AST types, etc.
```

**Compile it**:

```bash
./tuffc lib.tuff -o lib.c
# Generates: lib.c and lib.h
```

### Step 3: Link C Bootstrap with Tuff Library

Modify `tuffc.c` to `#include "lib.h"` and link with `lib.c`:

```bash
gcc tuffc.c lib.c -o tuffc-hybrid
```

Now the C compiler can call Tuff functions from the library.

### Step 4: Incremental Migration (No Big Bang!)

Gradually replace C functions with Tuff equivalents:

**Example - Migrate String Handling**:

1. Implement string functions in `lib.tuff`
2. Recompile: `./tuffc lib.tuff -o lib.c`
3. Update `tuffc.c` to use Tuff's string functions instead of C strings
4. Recompile: `gcc tuffc.c lib.c -o tuffc-hybrid`
5. Test

**Example - Migrate Lexer**:

1. Implement lexer in `lexer.tuff`
2. Compile: `./tuffc-hybrid lexer.tuff -o lexer.c`
3. Replace lexer code in `tuffc.c` with calls to Tuff lexer (via `lexer.h`)
4. Recompile: `gcc tuffc.c lexer.c lib.c -o tuffc-hybrid`
5. Test

**Example - Migrate Parser**:

1. Implement parser in `parser.tuff`
2. Compile: `./tuffc-hybrid parser.tuff -o parser.c`
3. Replace parser in `tuffc.c` with calls to Tuff parser
4. Recompile: `gcc tuffc.c parser.c lexer.c lib.c -o tuffc-hybrid`
5. Test

**Continue until**:

```bash
# Eventually, main.c is just:
# #include "compiler.h"
# int main(int argc, char** argv) { return tuff_main(argc, argv); }

gcc main.c compiler.c parser.c lexer.c lib.c -o tuffc
```

### Step 5: Full Self-Hosting

When all compiler logic is in Tuff:

```bash
# Compile all Tuff files
./tuffc compiler.tuff -o compiler.c
./tuffc parser.tuff -o parser.c
./tuffc lexer.tuff -o lexer.c
./tuffc lib.tuff -o lib.c

# Link with minimal C main
gcc main.c compiler.c parser.c lexer.c lib.c -o tuffc-selfhosted

# Now use it to compile itself again
./tuffc-selfhosted compiler.tuff -o compiler2.c
# ... compile all
gcc main.c compiler2.c parser2.c lexer2.c lib2.c -o tuffc-gen2

# Verify stability
diff compiler.c compiler2.c
```

### Step 6: Iterative Enhancement

Once fully self-hosted, gradually add advanced features:

1. Add generics
2. Add refinement types
3. Add borrow checker
4. Add LLVM backend (keep C backend for bootstrap)
5. Add JavaScript backend
6. Add contracts
7. Add closures
8. Add async/await
9. Add module system
10. Optimize compiler

---

## Testing Strategy

### Compiler Tests

**Unit Tests**: Test each component independently:

- Lexer: token stream correctness
- Parser: AST correctness
- Type checker: error detection
- Code generator: valid C output

**Integration Tests**: End-to-end compilation:

- Compile simple programs
- Verify generated C compiles with gcc/clang
- Verify executable runs correctly
- Compare output across incremental migrations

### Incremental Validation

After each migration step:

```bash
# Before migration
./tuffc-before test_program.tuff -o test_before.c
gcc test_before.c -o test_before
./test_before > output_before.txt

# After migration (added new Tuff module)
./tuffc-after test_program.tuff -o test_after.c
gcc test_after.c -o test_after
./test_after > output_after.txt

# Verify equivalence
diff output_before.txt output_after.txt
```

**Success**: Output should be identical (or functionally equivalent).

### Self-Hosting Validation

Once fully migrated to Tuff, test multi-generation compilation:

```bash
# Generation 0: Hybrid bootstrap (C main + Tuff modules)
gcc main.c compiler.c parser.c lexer.c lib.c -o tuffc0

# Generation 1: Compile all Tuff modules
./tuffc0 compiler.tuff -o compiler1.c
./tuffc0 parser.tuff -o parser1.c
./tuffc0 lexer.tuff -o lexer1.c
./tuffc0 lib.tuff -o lib1.c
gcc main.c compiler1.c parser1.c lexer1.c lib1.c -o tuffc1

# Generation 2: Compile again
./tuffc1 compiler.tuff -o compiler2.c
./tuffc1 parser.tuff -o parser2.c
./tuffc1 lexer.tuff -o lexer2.c
./tuffc1 lib.tuff -o lib2.c
gcc main.c compiler2.c parser2.c lexer2.c lib2.c -o tuffc2

# Verify stability: gen1 and gen2 should produce identical code
diff compiler1.c compiler2.c
diff parser1.c parser2.c
diff lexer1.c lexer2.c
diff lib1.c lib2.c
```

**Success Criteria**: The compiler stabilizes (identical output across generations).

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

1. ✅ `tuffc` (written in C) can compile Tuff code to `.c` and `.h` files
2. ✅ `lib.tuff` compiles and links successfully with C code
3. ✅ Incremental migration works: C code can call Tuff functions via generated headers
4. ✅ All compiler logic has been migrated from C to Tuff modules
5. ✅ The fully Tuff-based compiler stabilizes (generation N and N+1 produce identical output)
6. ✅ All test programs compile and run correctly
7. ✅ The compiler passes all unit and integration tests

**Key Advantage**: No "big bang" rewrite. Each function can be migrated and tested independently.

At this point, Tuff is **self-hosted** and ready for incremental enhancement.

---

**End of Bootstrap Specification**
