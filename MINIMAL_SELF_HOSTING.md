# Tuff Minimal Self-Hosting Feature Set

## Overview

This document specifies the **absolute bare minimum** set of Tuff features required to write a Tuff compiler in Tuff itself (self-hosting). Safety mechanisms from `UB_PREVENTION.md` are explicitly **deferred** — the goal is a working bootstrap compiler, not a safe one. Features are included only if a compiler cannot be written without them.

**Relationship to other documents:**
- `SPECIFICATION.md` — The full language. This document is a strict subset.
- `UB_PREVENTION.md` — Safety guarantees. Almost entirely deferred for the bootstrap.

**Design Principle**: Every feature included must be justified by "a compiler needs this to process source code and emit output."

---

## 1. What a Compiler Needs

A compiler pipeline requires:

1. **Read source text** from files (byte/char processing)
2. **Tokenize** (lexical analysis: recognize identifiers, keywords, literals, operators)
3. **Parse** (build an AST from tokens)
4. **Represent the AST** (tree data structures with variant nodes)
5. **Analyze** (walk the AST: name resolution, type checking)
6. **Emit code** (generate output text or bytes)
7. **Manage memory** (allocate AST nodes, strings, tables — with realistic lifetimes)
8. **Report errors** (format messages, exit with codes)
9. **Handle CLI** (arguments, file I/O)

Each feature below maps to one or more of these needs.

---

## 2. Minimal Type System

### 2.1 Required Primitive Types

| Type | Why Required |
|------|-------------|
| `U8` | Byte-level processing (file content, UTF-8) |
| `U32` | General integer arithmetic, flags |
| `U64` | Sizes, counts, hashing |
| `I32` | Exit codes, general signed arithmetic |
| `Bool` | Conditions everywhere |
| `Char` | Character classification (lexer) |
| `USize` | Array lengths, indices |
| `Null` | Nullable unions (error returns, optional values) |
| `Void` | Procedures with no result |

**Excluded**: `U16`, `I8`, `I16`, `I64`, `F32`, `F64`
- **Justification**: A compiler processes text and integers. Floating-point literals in source can be lexed as strings and only parsed into `F32`/`F64` values when *emitting* constants — and even then, the emitted bytes can be constructed from string manipulation without host float support. The excluded integer types are conveniences, not necessities.

### 2.2 Required Composite Types

| Type | Why Required |
|------|-------------|
| **Structs** | AST nodes, token records, symbol table entries |
| **Unions** | AST node variants, `Result`-like error types, `Option`-like values |
| **Enums** | Token kinds, operator kinds (simple integer constants) |
| **Arrays** `[T; L]` | Fixed buffers, small lookup tables |
| **Slices** `&[T]` | String/byte views with runtime length |
| **Type aliases** `type` | Readability of AST type definitions |

**Excluded**: String type family (`String`, `String<N>`, `&Str<N>`)
- **Justification**: `&[U8]` with a manual length, or `&Str` alone, is sufficient. The full string type hierarchy is a convenience. The bootstrap uses `&Str` (borrowed slice) exclusively — string literals are `&Str`, file contents are read into byte buffers viewed as `&Str`.

### 2.3 Excluded Type Features

| Feature | Why Excluded |
|---------|-------------|
| **Refinement types** | The bootstrap compiler doesn't need compile-time value proofs. Array indexing is checked at runtime (or unchecked in truly minimal mode). |
| **Generics** | AST nodes can use unions of concrete types instead of `Vec<T>`, `Option<T>`, etc. Painful but possible. See §4.1 for how this works. |
| **`uninit`** | Memory from FFI can be treated as immediately initialized (trusting `malloc` returns zeroed or immediately-written memory). Unsafe but workable. |
| **Function pointers** | All dispatch can be done via `match` on enum tags. Function pointers are a convenience for visitor patterns, not a necessity. |

---

## 3. Minimal Syntax

### 3.1 Variables

```tuff
let x = expression;
let mut x = expression;
let x : Type = expression;
```

No type inference beyond the right-hand side literal. Explicit annotations everywhere in practice.

### 3.2 Functions

```tuff
fn name(param : Type, ...) : ReturnType => body;
```

Single-expression or block bodies. No associated functions (`this` parameter) — free functions with explicit first parameters work fine.

### 3.3 Structs

```tuff
struct Token {
    kind : TokenKind,
    start : U32,
    length : U32,
}
```

No `mut` on fields needed for minimal version — the entire struct binding controls mutability. (This simplifies the compiler's mutability tracking.)

### 3.4 Enums

```tuff
enum TokenKind {
    Identifier,
    IntegerLiteral,
    Keyword,
    Operator,
    // ...
}
```

C-style, implicit `I32`.

### 3.5 Unions

```tuff
type AstNode = LiteralNode | IdentNode | CallNode | IfNode | /* ... */;
```

With `is` checks and `match` for narrowing.

### 3.6 Control Flow

```tuff
if (cond) { } else { }
while (cond) { }
match (expr) { case A => { } case _ => { } }
break;
continue;
return expr;
```

**Excluded**: `for` loops
- **Justification**: `while` with manual index/generator calls can express everything `for` can. The `for` loop's iterator protocol is sugar.

### 3.7 Expressions

- Arithmetic: `+`, `-`, `*`, `/`, `%`
- Comparison: `==`, `!=`, `<`, `>`, `<=`, `>=`
- Logical: `&&`, `||`, `!`
- Field access: `expr.field`
- Array indexing: `expr[index]` — **runtime bounds checked** (not refinement-proven)
- Dereference: `*ref`
- Address-of: `&expr`, `&mut expr`
- Casts: `expr as Type` — **only widening integer casts** are guaranteed; other casts are permitted but unchecked
- Compound assignment: `+=`, `-=`, `*=`, `/=`, `%=`

**Excluded**: Ranges (`..`) — only needed for `for` loops, which are excluded.

---

## 4. Minimal Memory Model

### 4.1 Memory Management Without Generics

The full language uses generics for `Vec<T>`, `Option<T>`, `Result<T, E>`. The bootstrap avoids generics entirely using two techniques:

**Technique 1: Concrete unions instead of `Option<T>`**

```tuff
// Instead of Option<Token>:
struct SomeToken { value : Token }
struct NoToken {}
type MaybeToken = SomeToken | NoToken;
```

**Technique 2: Arena allocation via FFI**

The compiler's dominant allocation pattern is: allocate many nodes, use them, free everything at once. An arena allocator handles this perfectly without ownership tracking:

```tuff
extern fn malloc(size : U64) : &mut U8;
extern fn free(ptr : &mut U8) : Void;

// Bump allocator state
struct Arena {
    mut buffer : &mut U8,
    mut offset : U64,
    mut capacity : U64,
}

fn arena_alloc(arena : &mut Arena, size : U64) : &mut U8 => {
    // Bump pointer, return offset
    // (Implementation details omitted — requires pointer
    //  arithmetic which is done via FFI or U8 casts)
}
```

All AST nodes, strings, and tables are allocated from arenas. The arena is freed once per compilation. This eliminates the need for ownership tracking in the bootstrap compiler's own data structures.

### 4.2 Ownership: Enforced or Not?

**Decision**: The bootstrap compiler **does not enforce** ownership/borrow checking.

**Justification**: A self-hosting bootstrap works in two stages:
1. **Stage 0**: Write the compiler in an existing host language (C, Rust, etc.)
2. **Stage 1**: Compile the Tuff compiler with Stage 0, producing a Tuff-written compiler

The Stage 0 compiler is trusted to be correct. The Stage 1 compiler (written in Tuff) uses arena allocation, making most ownership issues moot — memory is never freed individually, only wholesale.

**What IS needed from the type system**:
- Type checking (mismatched types are bugs, not just safety issues)
- Exhaustive `match` (catches missing AST node cases — a correctness feature)
- `Null` union handling (prevents null dereference crashes in the compiler itself)

**What is NOT needed**:
- Borrow checking (arena allocation + single-threaded + careful coding)
- Move semantics (copy everything; AST nodes are small)
- Lifetime tracking (arena outlives all allocations)

---

## 5. Minimal Module System

```tuff
let { malloc, free } = extern stdlib;
let { Token, TokenKind, tokenize } = "lexer";
```

- File-path-based imports
- Destructuring to select members
- `out` for exports
- `extern` for FFI

No FQN paths (`::`) needed in the minimal version — destructured names are used directly.

---

## 6. Minimal FFI

```tuff
extern fn malloc(size : U64) : &mut U8;
extern fn free(ptr : &mut U8) : Void;
extern fn fopen(path : &Str, mode : &Str) : &mut U8 | Null;
extern fn fread(buffer : &mut U8, size : U64, count : U64, file : &mut U8) : U64;
extern fn fwrite(buffer : &U8, size : U64, count : U64, file : &mut U8) : U64;
extern fn fclose(file : &mut U8) : I32;
extern fn exit(code : I32) : Void;
```

The bootstrap needs: memory allocation, file I/O, and process exit. Nothing else.

---

## 7. Minimal Runtime Requirements

### 7.1 What the Compiled Code Needs

- **Stack allocation**: Local variables, call frames
- **No garbage collection**: Arenas + explicit frees
- **No runtime type information**: All type checks at compile time
- **No exceptions**: Errors via `Null` unions and explicit checks

### 7.2 Entry Point

```tuff
fn main(args : &[&Str]) : I32 => {
    // Parse arguments
    // Read input file
    // Compile
    // Write output file
    return 0;
}
```

---

## 8. Explicitly Deferred Features

These features are part of the full language but are **not needed** for self-hosting:

| Feature | Deferred Because |
|---------|-----------------|
| Refinement types | Compile-time proofs not needed; runtime checks suffice |
| Borrow checker | Arena allocation eliminates most lifetime concerns |
| Move semantics | Copy-by-default works for compiler data structures |
| Generics | Concrete unions + arena allocation replace generic containers |
| `for` loops / iterators | `while` loops suffice |
| `uninit` tracking | Trust FFI allocation + immediate writes |
| Closures | Enum dispatch + explicit state structs |
| Function pointers | Enum dispatch |
| `this` / associated functions | Free functions with explicit first param |
| Refinement on fn pointers | No fn pointers |
| `then` cleanup | Arena free-at-once; manual cleanup for file handles |
| `match` as expression | Use `match` as statement with mutable result variable |
| Implicit returns | Always use explicit `return` |
| Compound integer types (`U16`, `I8`, etc.) | `U32`/`U64`/`I32` cover compiler needs |
| Float types | Lex floats as strings; emit as bytes |
| String type family | `&Str` + `&[U8]` suffice |
| Range syntax (`..`) | No `for` loops |
| Cross-platform codegen | Bootstrap targets one platform initially |

---

## 9. Self-Hosting Roadmap

### Stage 0: Host Compiler
- Written in an existing language (C, Rust, etc.)
- Implements the **full** Tuff specification
- Compiles Tuff → native code

### Stage 1: Bootstrap Compiler (this document)
- Written in minimal Tuff (this document's feature set)
- Compiled by Stage 0 compiler
- Implements the **full** Tuff specification (or a large subset)
- Proves self-hosting is possible

### Stage 2: Self-Compiled Compiler
- The Stage 1 compiler compiles itself
- Output compared with Stage 1 output (should be identical)
- Self-hosting achieved

### Adding Safety Back
After self-hosting, safety features are added incrementally:
1. Exhaustive match checking (already present — needed for correctness)
2. Type checking (already present — needed for correctness)
3. Borrow checker (Stage 2+)
4. Refinement types (Stage 3+)
5. `uninit` tracking (Stage 3+)

---

## 10. Grammar for Minimal Tuff

```
program        := item*
item           := function | struct_decl | enum_decl | type_alias | extern_decl | global_var
function       := "fn" ident "(" params ")" ":" type "=>" body ";"
params         := (param ("," param)*)?
param          := ident ":" type
body           := expr | block
block          := "{" stmt* "}"
stmt           := let_stmt | assign_stmt | expr_stmt | if_stmt | while_stmt
                | match_stmt | return_stmt | break_stmt | continue_stmt
let_stmt       := "let" "mut"? ident (":" type)? "=" expr ";"
assign_stmt    := expr "=" expr ";" | expr compound_op expr ";"
expr_stmt      := expr ";"
if_stmt        := "if" "(" expr ")" block ("else" block)?
while_stmt     := "while" "(" expr ")" block
match_stmt     := "match" "(" expr ")" "{" match_arm+ "}"
match_arm      := "case" pattern "=>" block
return_stmt    := "return" expr? ";"
break_stmt     := "break" ";"
continue_stmt  := "continue" ";"

struct_decl    := "struct" ident "{" field* "}"
field          := "mut"? ident ":" type ","
enum_decl      := "enum" ident "{" variant* "}"
variant        := ident ","
type_alias     := "type" ident "=" type ";"
extern_decl    := "extern" "fn" ident "(" params ")" ":" type ";"
global_var     := "let" ident ":" type "=" expr ";"

type           := primitive | ident | ref_type | array_type | slice_type
                | union_type | fn_ptr_type
primitive      := "U8" | "U32" | "U64" | "I32" | "Bool" | "Char" | "USize" | "Null" | "Void"
ref_type       := "&" "mut"? type
array_type     := "[" type ";" expr "]"
slice_type     := "&" "[" type "]" | "&" "[" type ";" expr "]"
union_type     := type "|" type
fn_ptr_type    := "&" "(" types ")" "=>" type

expr           := literal | ident | call | field_access | index | unary
                | binary | cast | struct_init | paren | if_expr | block
literal        := integer | string | char | bool | null
call           := expr "(" args ")"
field_access   := expr "." ident
index          := expr "[" expr "]"
unary          := ("!" | "-" | "*" | "&" | "&mut") expr
binary         := expr bin_op expr
cast           := expr "as" type
struct_init    := ident "{" field_init* "}"
field_init     := ident ":" expr ","
```

---

## 11. Validation Checklist

A Stage 1 bootstrap compiler implementing this minimal feature set must be able to:

- [ ] Read a `.tuff` source file into memory as bytes
- [ ] Tokenize the source into a token stream
- [ ] Parse the token stream into an AST
- [ ] Represent AST nodes using structs and unions
- [ ] Walk the AST to perform name resolution
- [ ] Walk the AST to perform type checking
- [ ] Emit target code (initially C source or assembly text)
- [ ] Allocate and manage memory via arena allocator
- [ ] Report errors with line/column information
- [ ] Accept command-line arguments (input file, output file)
- [ ] Exit with appropriate status codes
- [ ] Compile a "hello world" Tuff program end-to-end
- [ ] Compile its own source code (Stage 2)

---

## 12. Risk Assessment

| Risk | Mitigation |
|------|-----------|
| No generics makes AST representation verbose | Accept verbosity; use consistent naming conventions |
| No borrow checker allows memory bugs | Arena allocation + single-threaded + code review |
| No closures makes visitor patterns awkward | Enum dispatch with match; explicit state passing |
| No refinement types allows index errors | Runtime bounds checks on all array accesses |
| No `then` cleanup leaks file handles | Manual `fclose` before exit; short-lived process |
| Copy-by-default is slow for large structs | AST nodes kept small; use references where needed |

---

## 13. Feature Diff: Full vs. Minimal

```
Full Tuff                                    Minimal Tuff
─────────────────────────────────────────────────────────────
All integer types                    →       U8, U32, U64, I32, USize
F32, F64                             →       (none)
String family (5 types)              →       &Str only
Refinement types                     →       (none)
Generics                             →       (none)
Ownership + borrow checker           →       Type checking only
Move semantics                       →       Copy-by-default
uninit tracking                      →       (none)
Closures (3 variants)                →       (none)
Function pointers                    →       (none)
for loops + iterators                →       while loops
match as expression                  →       match as statement
then cleanup                         →       Manual cleanup
this / associated functions          →       Free functions
Implicit returns                     →       Explicit return only
Range syntax (..)                    →       (none)
Field-level mut                      →       Binding-level mut only
```
