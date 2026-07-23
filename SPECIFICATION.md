# Tuff Language Specification

## 1. Purpose and Scope

Tuff is a systems programming language designed for safety-critical environments with **zero undefined behavior**. Every program that compiles is guaranteed to have fully defined semantics — no uninitialized memory, no data races, no buffer overflows, no integer overflow UB, no null pointer dereference, and no dangling references.

**Target audience:** Systems programmers building safety-critical software (bare-metal firmware, OS kernels, embedded systems, infrastructure).

**Success criteria:** A program that compiles in Tuff exhibits no undefined behavior under any execution conditions.

**Backend:** LLVM (architecture-agnostic code generation).

---

## 2. Domain Model

### 2.1 Entities

| Entity              | Description                                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Primitive types** | `I8`, `I16`, `I32`, `I64`, `U8`, `U16`, `U32`, `U64`, `Bool`, `Char`, `Ptr<T>` — width encoded in type name |
| **Option<T>**       | Explicit absence of value; no null                                                                          |
| **Result<T, E>**    | Explicit error handling; no exceptions                                                                      |
| **Array<T, N>**     | Fixed-size array with length in type                                                                        |
| **Slice<T>**        | Dynamic view into contiguous memory                                                                         |
| **Struct**          | Named composite types with explicit fields                                                                  |
| **Enum**            | Tagged unions with exhaustive matching                                                                      |
| **Contract**        | Trait-like interfaces for polymorphism                                                                      |
| **Function**        | Named or anonymous (closure) code blocks                                                                    |
| **Module**          | File-based code organization with FQN imports                                                               |
| **Refinement**      | First-order logic predicates attached to types                                                              |

### 2.2 Relationships

- **Ownership:** Every value has exactly one owner. Values are moved on assignment, not copied (unless type is `Copy`).
- **Borrowing:** Immutable borrows (`&T`) allow multiple concurrent readers. Mutable borrows (`&mut T`) allow exclusive access. Enforced at compile time.
- **Refinements:** Predicates constrain type values independently of ownership. A value must satisfy its refinement at all times.
- **Generics:** Types and functions can be parameterized over type variables with optional contract bounds.

### 2.3 State Transitions

```
Value Created → Value Used (per type rules) → Value Dropped
```

- Values are created via declaration, function return, or allocation.
- Values are used according to their type's rules (borrowing, refinement).
- Values are deterministically dropped when their owner goes out of scope.
- No dangling references: borrow checker ensures all references outlive their owners.
- No manual memory management: ownership system handles all deallocation.

---

## 3. Functional Requirements

### 3.1 Syntax

#### Declarations

```tuff
// Variable declaration
let x = expr;
let x : T = expr;

// Refinement on variable
let x : I32 > 100 = expr;

// Function declaration
fn add(first : I32, second : I32) : I32 => expr;

// Multi-expression function
fn compute(x : I32) : I32 {
    let y = x * 2;
    y + 1;
}

// Struct declaration (no semicolon after body)
struct Point {
    x : I32,
    y : I32,
}

// Enum declaration
enum Color {
    Red,
    Green,
    Blue,
}

// Generic struct
struct Box<T> {
    value : T,
}

// Contract (trait-like)
contract Read {
    fn read(&mut self, buf : &mut [U8]) : Result<U32, Error>;
}

// Contract implementation
impl Read for File {
    fn read(&mut self, buf : &mut [U8]) : Result<U32, Error> {
        // ...
    }
}
```

#### Expressions

```tuff
// Arithmetic
let sum = a + b;
let diff = a - b;
let prod = a * b;
let quot = a / b;       // requires refinement: b != 0
let rem = a % b;

// Comparison
let eq = a == b;
let ne = a != b;
let lt = a < b;
let gt = a > b;
let le = a <= b;
let ge = a >= b;

// Logical
let and = a && b;
let or = a || b;
let not = !a;

// Assignment
x = expr;
x += expr;
x -= expr;
x *= expr;
x /= expr;
```

#### Control Flow

```tuff
// If/else (statements)
if (cond) {
    stmts
} else {
    stmts
}

// While loop
while (cond) {
    stmts
}

// Match expression
let temp = match (expr) {
    case Some(v) => v,
    case None => 0,
};

// Match with wildcard
let result = match (opt) {
    case Some(v) => v * 2,
    case _ => 0,
};
```

#### Closures

```tuff
// TypeScript-style closure syntax
let f = (x : I32, y : I32) : I32 => x + y;

// Multi-expression closure
let g = (x : I32) : I32 {
    let y = x * 2;
    y + 1;
};
```

#### Borrowing

```tuff
// Immutable borrow
fn get_x(p : &Point) : I32 => p.x;

// Mutable borrow
fn set_x(p : &mut Point, val : I32) => p.x = val;
```

#### Generics

```tuff
// Generic function
fn first<T>(arr : &Array<T, N>) : Option<T> {
    // ...
}

// Generic with contract bound
fn print<T: Display>(value : &T) : Result<(), Error> {
    // ...
}
```

#### FFI Declarations

```tuff
extern let { malloc, free } = extern stdlib;
```

#### Module Imports

```tuff
// Fully qualified names
let file = std::io::File::open("path");
let map = std::collections::HashMap::new();
```

#### Literals

```tuff
// Integer literals
42
-17
0xFF
0b1010

// Float literals
3.14f32
2.718f64

// Boolean literals
true
false

// String literals
"hello, world"

// Array literals
[1, 2, 3]
```

#### Comments

```tuff
// Single-line comment
/* Multi-line
   comment */
```

### 3.2 Expected Behaviors

#### Declaration Behavior

- Expression must be fully evaluated before binding.
- Type must be inferred or match declared type.
- Refinement predicates are checked at assignment.
- Ownership is transferred on assignment; source is invalidated.

#### Function Call Behavior

- Arguments are evaluated left-to-right (defined order).
- Return values of type `Result` must be handled (cannot be silently discarded).
- Borrowing rules are enforced at call site.
- No stack overflow UB: stack bounds are tracked.

#### FFI Call Behavior

- Input refinement predicates must be proven at compile time.
- Output values are validated against refinement contracts.
- FFI calls return `Result`; never panic.
- No runtime fallback: if proof cannot be established, compilation fails.

#### Array Access

```tuff
let val = arr[index];
// Requires compile-time proof: 0 <= index < arr.len
```

- If the compiler cannot prove the bound, compilation fails with a clear error.
- No runtime bounds check is inserted (zero-cost).
- For cases where proof is infeasible, use `arr.get(index) : Option<T>` instead.

#### Division

```tuff
let result = a / b;
// Requires compile-time proof: b != 0
```

- Refinement type system proves divisor is non-zero.
- If proof fails, compilation error.
- For runtime-dependent divisors, use `a.div(b) : Result<T, DivByZeroError>`.

### 3.3 Business Rules

#### Type System Rules

1. **All values initialized:** Every variable must be assigned before use. Uninitialized variables are a compile error.
2. **Bounds safety:** Array/slice access requires compile-time proof of bounds, or returns `Option`.
3. **Alias control:** No simultaneous mutable and immutable references to the same data. Enforced by borrow checker.
4. **Exhaustive pattern matching:** All enum variants must be handled in `match` expressions.
5. **Null safety:** No null type. Absence is represented by `Option<T>`.
6. **Integer safety:** Integer width is encoded in type name (`I32`, `U64`). Overflow behavior is defined by type (wrapping, saturating, or `Result`).
7. **No implicit casts:** All type conversions are explicit. Only widening conversions are safe by default. Narrowing requires refinement proof.

#### Ownership Rules

1. Each value has exactly one owner.
2. Values are moved on assignment.
3. Immutable borrows (`&T`) allow multiple concurrent readers.
4. Mutable borrows (`&mut T`) allow exclusive access.
5. References cannot outlive their owner.
6. Drop order is deterministic (reverse of creation order within scope).

#### Refinement Rules

1. Refinements are first-order logic predicates.
2. Refinements are independent of ownership.
3. Refinements must be proven at compile time.
4. If proof fails, compilation error (no runtime fallback).
5. Refinement predicates can reference value properties: `x > 0`, `x < len`, etc.

#### Concurrency Rules

1. Type-safe concurrency: `Send` and `Sync` contracts determine thread safety.
2. Data races are prevented at compile time by borrow checker.
3. Shared mutable state requires explicit synchronization primitives.
4. Message-passing channels are preferred for inter-thread communication.

### 3.4 Workflows

#### Compilation Pipeline

```
Source Code → Parse → Type-Check → Prove Refinements → Generate LLVM IR → Optimize → Emit Binary
```

1. **Parse:** Source code is parsed into AST.
2. **Type-Check:** Types are verified, ownership rules enforced, borrow checking performed.
3. **Prove Refinements:** Refinement predicates are proven using built-in proof engine.
4. **Generate LLVM IR:** Verified AST is lowered to LLVM IR.
5. **Optimize:** LLVM optimization passes are applied.
6. **Emit Binary:** Target-specific binary is generated.

#### Error Propagation Flow

```tuff
fn read_file(path : &str) : Result<String, Error> {
    let file = open(path)?;      // ? propagates errors
    let content = file.read()?;  // ? propagates errors
    Ok(content);
}

fn main() : Result<(), Error> {
    let data = read_file("input.txt")?;
    println(data);
    Ok(());
}
```

- `Result<T, E>` must be explicitly handled.
- `?` operator propagates errors up the call stack.
- No exceptions: all errors are values.
- Custom error types can be defined by the user.

#### Module Organization

```
project/
├── core/          # Bare-metal core library
│   ├── option.tuff
│   ├── result.tuff
│   ├── array.tuff
│   └── slice.tuff
├── stdlib/        # OS-dependent standard library
│   ├── io.tuff
│   ├── fs.tuff
│   ├── net.tuff
│   └── collections/
└── src/           # User code
```

- File-based modules: each `.tuff` file is a module.
- Fully qualified names for imports.
- `core` is available in all environments (bare-metal).
- `stdlib` is available only when an OS is present.

---

## 4. Edge Cases and Error Handling

### 4.1 Empty Collections

- Accessing `arr[index]` on empty collection: compile error (cannot prove `0 <= index < 0`).
- `arr.get(index)` returns `Option<T>`: `None` for empty collections.
- Iterating empty collection: defined as zero iterations (no-op).
- `arr.len` always returns valid length (0 for empty).

### 4.2 Division by Zero

- `a / b` requires compile-time proof `b != 0`.
- If proof fails: compile error.
- Runtime-dependent divisors: use `a.div(b) : Result<T, DivByZeroError>`.

### 4.3 Integer Overflow

- Integer width is encoded in type (`I32`, `U64`).
- Overflow behavior is defined by operation:
  - `a + b`: wrapping by default (defined behavior).
  - `a.checked_add(b)`: returns `Option<T>` (None on overflow).
- No undefined behavior: all arithmetic is well-defined.

### 4.4 Concurrent Access

- Two threads mutating same data: compile-time rejection by borrow checker.
- Shared read access: allowed via immutable borrows.
- Mutable shared access: requires `Mutex<T>` or similar synchronization primitive.
- Data races are impossible by construction.

### 4.5 FFI Failures

- FFI call with unproven refinement: compile error.
- FFI call returning invalid output: validated against refinement contract.
- No runtime panic: FFI failures return `Result`.

### 4.6 Stack Overflow

- Stack bounds are tracked by ownership system.
- Recursive functions must prove termination or be marked as potentially non-terminating.
- No stack overflow UB: behavior is defined (stack check at runtime).

---

## 5. Non-Functional Requirements

### 5.1 Performance

- **Zero-cost abstractions:** No runtime overhead for safety features.
- Borrow checking, refinement proofs, and bounds checking are compile-time only.
- Generated code is comparable to C/C++ in performance.

### 5.2 Scalability

- Supports large codebases via modular compilation.
- Incremental compilation for fast rebuilds.
- Parallel type-checking and proof verification.

### 5.3 Security

- No undefined behavior by construction.
- Memory safety: no buffer overflows, no use-after-free, no dangling pointers.
- Type safety: no type confusion, no invalid casts.
- Refinement types prevent invalid states.

### 5.4 Compatibility

- **Target architectures:** x86/x86_64, ARM (32-bit + AArch64), WebAssembly.
- **Backend:** LLVM (leverages existing optimization infrastructure).
- **FFI:** Compatible with C ABI for external library integration.

### 5.5 Tooling

- **Compiler:** Clear, actionable error messages (especially for proof failures).
- **Formatter:** Automatic code formatting.
- **Linter:** Style and correctness checks.
- Future: REPL/interactive mode, IDE support (LSP).

### 5.6 Learning Curve

- **Power first:** Steep learning curve but maximum expressiveness.
- Target audience is experienced systems programmers.
- Comprehensive documentation and examples.

---

## 6. Data Requirements

### 6.1 Input Formats

- Source files: `.tuff` extension.
- UTF-8 encoding.
- Module structure: file-based with FQN imports.

### 6.2 Output Formats

- Binary executables (target-specific).
- LLVM IR (intermediate representation).
- Compiler diagnostics (structured error messages).

### 6.3 Storage Requirements

- No runtime storage overhead for safety features.
- Compile-time proof storage: minimal (proofs are discarded after verification).
- Binary size: comparable to C/C++ (no runtime library bloat).

### 6.4 Retention Policies

- Source code: user-managed.
- Build artifacts: user-managed (target directory).
- Compiler caches: automatic cleanup.

---

## 7. External Dependencies

### 7.1 LLVM

- **Purpose:** Code generation and optimization backend.
- **Version:** LLVM 18+ (for latest target support).
- **Integration:** Tuff compiler generates LLVM IR, which is optimized and compiled to target binary.

### 7.2 FFI

- **Purpose:** Integration with existing C libraries and system calls.
- **Safety:** Refinement predicates proven at compile time.
- **ABI:** C ABI compatibility.

### 7.3 Build System

- **Purpose:** Project management, dependency resolution, compilation orchestration.
- **Format:** Declarative build configuration (TOML/JSON).
- **Features:** Incremental builds, parallel compilation, cross-compilation.

---

## 8. Constraints and Assumptions

### 8.1 Technical Constraints

- LLVM must be available as a compilation backend.
- Refinement proof engine has decidability limits (first-order logic).
- No runtime overhead for safety features (zero-cost abstractions).
- Bare-metal support requires no OS dependencies in `core`.

### 8.2 Business Constraints

- Target audience: experienced systems programmers.
- Safety-critical domains require formal verification capabilities.
- Learning curve is acceptable for target audience.

### 8.3 Assumptions

- Users understand systems programming concepts (memory, concurrency, FFI).
- LLVM provides sufficient target coverage for embedded systems.
- First-order logic refinements are sufficient for most safety proofs.
- No termination guarantees are acceptable for practical use (servers, REPLs).

---

## 9. Acceptance Criteria

### 9.1 Compilation

- [ ] All programs that compile have no undefined behavior.
- [ ] Compilation fails for unproven refinements.
- [ ] Compilation fails for unhandled `Result` types.
- [ ] Compilation fails for non-exhaustive pattern matching.
- [ ] Compilation fails for data races.

### 9.2 Runtime

- [ ] No runtime panics from safety violations.
- [ ] Deterministic drop order.
- [ ] Zero runtime overhead for borrow checking.
- [ ] Zero runtime overhead for refinement proofs.
- [ ] Stack overflow is defined behavior (not UB).

### 9.3 FFI

- [ ] FFI calls require proven refinement predicates.
- [ ] FFI output is validated against contracts.
- [ ] FFI failures return `Result`, never panic.

### 9.4 Tooling

- [ ] Compiler produces clear, actionable error messages.
- [ ] Formatter produces consistent output.
- [ ] Linter catches common mistakes.

---

## 10. Open Questions

- [ ] How should hardware/register access work? (Deferred)
- [ ] How should inline assembly be expressed?
- [ ] What is the exact FFI refinement syntax for complex C structs?
- [ ] How should the build system be designed?
- [ ] What proof engine should be used for refinement verification?
- [ ] How should macro/metaprogramming be handled? (Not in scope for v1)
- [ ] What is the exact error message format for proof failures?
- [ ] How should cross-compilation be configured?
