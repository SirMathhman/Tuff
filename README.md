# Tuff — Self-Hosting Compiler

A modern systems programming language with a self-hosting compiler that compiles `.tuff` source files to JavaScript **ES Modules**. Tuff is expression-oriented, garbage-collected, type-safe, and designed for clarity and safety while supporting low-level systems programming.

**Current Status**: The compiler is **self-hosting** (bootstrap achieved) — the compiler is written in Tuff and can compile itself. The language implements a growing subset of the [language specification](LANGUAGE.md) with a focus on core features: immutable variables, structs, unions, generics, pattern matching, and FFI to JavaScript.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Project Architecture](#project-architecture)
3. [Language Overview](#language-overview)
4. [Building and Testing](#building-and-testing)
5. [Project Status](#project-status)
6. [Long-Term Roadmap](#long-term-roadmap)
7. [Standard Library](#standard-library)
8. [Contributing](#contributing)
9. [Documentation](#documentation)

---

## Quick Start

### Prerequisites

- **Node.js** (for tests + build tooling)
- **Node.js** or **Deno** (for running compiled output)

### Installation

Clone the repository:

```bash
git clone https://github.com/your-repo/tuff.git
cd tuff
npm install
```

### Running Tests

```bash
# Run all tests (TypeScript + Tuff)
npm test

# Rebuild the prebuilt compiler from source
npm run build:selfhost-prebuilt
```

### Writing Your First Program

Create `hello.tuff`:

```tuff
from std::io use { print };

fn main() => {
    print("Hello, Tuff!\n")
}
```

Compile and run:

```bash
# Using the self-hosting compiler (via prebuilt)
node selfhost/prebuilt/tuffc.mjs hello.tuff -o hello.mjs

# Run the output
node hello.mjs
```

---

## Project Architecture

### High-Level Design

Tuff follows a traditional multi-stage compiler architecture:

```
Source Code (.tuff files)
        ↓
    Lexer (tokenization)
        ↓
    Parser (syntax → AST)
        ↓
    Analyzer (name resolution, type checking)
        ↓
    Emitter (AST → JavaScript ES Modules)
        ↓
    JavaScript Output (.mjs files)
```

### Compiler Structure

The self-hosting compiler is located in `src/main/tuff/compiler/` and is split into focused modules to keep file sizes manageable:

| Module                      | Purpose                                                         |
| --------------------------- | --------------------------------------------------------------- |
| **ast.tuff**                | Canonical AST definitions (Expr, Stmt, Decl, Span, types)       |
| **lexing.tuff**             | Tokenization; whitespace/comment handling; ASCII predicates     |
| **diagnostics.tuff**        | Error/warning collection and formatting                         |
| **parsing_primitives.tuff** | Low-level parsing utilities (tokens, positions, panic handling) |
| **parsing_types.tuff**      | Type expression parsing (`I32`, `String`, generics, etc.)       |
| **parsing_expr_stmt.tuff**  | Expression and statement parsing (`if`, `match`, `while`, etc.) |
| **parsing_decls.tuff**      | Declaration parsing (functions, structs, imports, modules)      |
| **emit_ast_js.tuff**        | Phase 3 scaffold: AST → JavaScript emitter (partial)            |
| **analyzer.tuff**           | Name resolution, type checking, scope validation                |
| **tuffc_lib.tuff**          | Compiler facade that orchestrates all modules                   |
| **tuffc.tuff**              | Main entry point                                                |

### Bootstrap Strategy

The compiler achieves self-hosting through a **prebuilt artifact strategy**:

1. **Stage 1 (TypeScript)**: Original bootstrap compiler in TypeScript (no longer active for compilation).
2. **Stage 2 (Tuff via Prebuilt)**: Tuff compiler source compiled by Stage 1 (prebuilt).
3. **Stage 3 (Self-Compile)**: Prebuilt compiler compiles itself → new compiler.
4. **Stage 4 (Fixed-Point)**: New compiler compiles itself again → verify Stage 3 == Stage 4.

Prebuilt artifacts are stored in `selfhost/prebuilt/` and include all compiled `.mjs` modules (not just `tuffc.mjs`). This allows tests to run without requiring self-compilation on first run.

### Diagnostics format

Compiler errors are formatted consistently to include:

- **File** name
- **Line** and **column**, plus absolute **offset**
- A short **reason/message**
- A **code frame** (source context + caret)
- The **line before/after** when available (small context window)
- **Span underlining** (multiple `^`) when the compiler can highlight a range
- An optional **recommended fix** (`help:`) when the compiler can suggest one

Example shape:

```text
path/to/file.tuff:12:34 (offset 567) error: <message>
    12 | <source line>
         |                                  ^
help: <recommended fix>
```

**To rebuild the prebuilt compiler after modifying compiler source:**

```bash
npm run build:selfhost-prebuilt
```

This script:

1. Compiles all `.tuff` compiler source using the current prebuilt
2. Verifies Stage 3 == Stage 4 (fixed-point)
3. Copies all emitted `.mjs` modules to `selfhost/prebuilt/`

---

## Language Overview

Tuff is a modern, safe, expression-oriented programming language. Here are the key features:

### Core Language Features

#### 1. **Expression-Based Semantics**

Everything in Tuff is an expression. Blocks evaluate to values unless terminated with a semicolon:

```tuff
let x = { let y = 10; y };  // Block evaluates to 10
let z = if (cond) 1 else 2; // If expressions must have else
```

#### 2. **Immutable by Default, Mutable with `let mut`**

```tuff
let x = 100;           // immutable
let mut counter = 0;
counter = counter + 1; // OK: counter is mutable
// x = 50;            // Error: x is immutable
```

#### 3. **No Variable Shadowing**

A name cannot be redeclared in nested or enclosing scopes:

```tuff
let x = 1;
{
    // let x = 2;  // Error: x already declared in enclosing scope
}
```

#### 4. **Primitive Types**

```tuff
let a: I32 = 42;           // signed 32-bit integer
let b: U32 = 100;          // unsigned 32-bit integer
let c: F32 = 3.14;         // 32-bit float
let d: Bool = true;        // boolean
let e: String = "Tuff";    // string
let f: Char = 'x';         // single character
let g: Void = {};          // unit type
```

Unsuffixed integer literals default to `I32`; unsuffixed floats default to `F32`:

```tuff
let x = 42;      // I32
let y = 42U8;    // U8
let z = 3.14;    // F32
let w = 3.14F64; // F64
```

#### 5. **Composite Types: Structs**

```tuff
struct Point {
    x: I32,
    y: I32
}

let p = Point { 10, 20 };
let x_coord: I32 = p.x;
```

#### 6. **Composite Types: Tuples**

```tuff
let pair: (I32, String) = (42, "hello");
let first = pair.0;   // 42
let second = pair.1;  // "hello"
```

#### 7. **Union Types (Sum Types)**

```tuff
type Result<T, E> = Ok<T> | Err<E>;
type Option<T> = Some<T> | None;

let success: Result<I32, String> = Ok(100);
let failure: Result<I32, String> = Err("oops");
let maybe: Option<I32> = Some(42);
```

#### 8. **Arrays and Slices**

Arrays track initialization count for safety:

```tuff
let arr: [U8; 3; 3] = [1, 2, 3];  // Type: [Type; Initialized; Length]
let s: *[U8] = &arr;              // Slice (pointer view)
```

#### 9. **Generics**

Structs and functions support type parameters:

```tuff
struct Pair<T, U> {
    first: T,
    second: U
}

fn swap<T, U>(pair: Pair<T, U>) : Pair<U, T> => {
    Pair { pair.second, pair.first }
}
```

When assigning a generic function to a variable, type parameters must be specified explicitly:

```tuff
fn id<T>(x: T) : T => x;
let f : (I32) => I32 = id<I32>;  // OK: type parameters specified
// let g = id;                    // Error: type parameters required
```

#### 10. **Pattern Matching**

Use `is` for simple type narrowing:

```tuff
let maybe: Option<I32> = Some(42);
if (maybe is Some) {
    let { value } = maybe;  // extract inner value
    io.print(value);
}
```

Use `match` for exhaustive pattern matching:

```tuff
let status: Status = Running;
let desc = match (status) {
    Running => "executing",
    Paused => "paused",
    Stopped => "finished"
};
```

#### 11. **Functions as First-Class Values**

Functions can be assigned to variables, passed as arguments, and returned from functions:

```tuff
fn apply(f: (I32, I32) => I32, a: I32, b: I32) : I32 => {
    f(a, b)
}

let add = (x: I32, y: I32) => { x + y };
let result = apply(add, 3, 4);  // 7
```

Functions and local variables share the same namespace — you cannot declare both a function and a variable with the same name in the same scope.

#### 12. **Classes (Constructor Sugar)**

The `class` keyword provides syntactic sugar for functions that yield `this` (the captured scope):

```tuff
class fn Point(x: I32, y: I32) => {
    fn manhattan() => x + y;
}

let p = Point(3, 4);
io.print(p.manhattan());  // 7
```

#### 13. **The `this` Keyword**

`this` captures the current scope as an object-like value with all visible variables as fields:

```tuff
let user = {
    let id: I32 = 1;
    let name: String = "Alice";
    this  // yields scope with id and name as fields
};

io.print(user.name);  // "Alice"
```

#### 14. **Control Flow**

**If expressions** (require `else` in expression context):

```tuff
let abs = if (x < 0) -x else x;  // OK: both branches produce I32
```

**While loops**:

```tuff
let mut i = 0;
while (i < 5) {
    io.print(i);
    i = i + 1;
}
```

**Loop expressions** (infinite loop with optional break value):

```tuff
let value = loop {
    i = i + 1;
    if (i == 10) break i;
};
```

**Break and continue** work as expected in loops.

#### 15. **Modules and Imports**

File-based implicit modules: a file `com/math.tuff` becomes the module `com::math`. Import with `from ... use { ... }`:

```tuff
from std::io use { print };
from com::math use { add, multiply };

fn main() => {
    print(add(2, 3));
}
```

Modules can also be explicitly declared within files:

```tuff
module Utils {
    fn helper() => { /* ... */ }
}

let result = Utils::helper();
```

#### 16. **Foreign Function Interface (FFI)**

Declare external types, variables, and functions to interop with JavaScript:

```tuff
extern fn log(msg: String) : Void;
extern let globalValue : I32;
extern type Promise<T>;

fn my_function() => {
    log("Hello from Tuff!");
}
```

#### 17. **Destructuring**

Unpack composite values into individual variables:

```tuff
struct Point { x: I32, y: I32 }
let p = Point { 10, 20 };
let { x, y } = p;

let (a, b) = (1, 2);
```

---

## Building and Testing

### Run Tests

```bash
# Run all tests (TypeScript + Tuff)
npm test

# Run only TypeScript tests
npm test -- src/test/ts/**

# Run specific test file
npm test -- src/test/ts/selfhost.test.ts
```

### Developer Tools

#### Tuff REPL (minimal)

This is a simple, buffer-based REPL that compiles and runs the current buffer as the body of `main()`.

```bash
npm run tuff:repl
```

Commands:

- `:run` — compile + run the current buffer
- `:show` — print current buffer
- `:clear` — clear buffer
- `:quit` — exit

#### Refactor CLI (move-file)

Moves a `.tuff` file on disk and updates `from <module> use ...` / `extern from <module> use ...` import paths across the project.

```bash
# Run from the repository root
npm run tuff:refactor -- move-file --from <oldRelPath.tuff> --to <newRelPath.tuff>
```

Options:

- `--root <dir>` — restrict scanning for `.tuff` files (default: `src`)
- `--dry-run` — compute changes but do not write files

### Test Organization

#### TypeScript Tests (`src/test/ts/`)

- **selfhost.test.ts** — Stage 1: validates basic compilation
- **selfhost_stage2.test.ts** — Stage 2: selfhost compiler compiles itself
- **selfhost_stage3.test.ts** — Stage 3/4: verify fixed-point (Stage 3 == Stage 4)
- **selfhost_types.test.ts** — type annotations, generics, type inference
- **selfhost_analyzer_shadowing.test.ts** — no-shadowing rule enforcement
- **selfhost_diagnostics.test.ts** — error message formatting
- **selfhost_module_split.test.ts** — module architecture validation
- **tuff_tests_runner.test.ts** — runs all Tuff `.test.tuff` files

#### Tuff Tests (`src/test/tuff/`)

- **selfhost_structs_unions.test.tuff** — struct/union construction and access
- **selfhost_tuples.test.tuff** — tuple literals and indexing
- **ast_smoke.test.tuff** — basic AST node creation
- **ast_emit_js.test.tuff** — AST → JS emission validation
- **selfhost_char.test.tuff** — character literal support

### Tuff Unit Testing Framework

A lightweight, dependency-free unit testing helper is provided in `src/main/tuff/std/test.tuff`:

```tuff
from std::test use { reset, it, expect_eq, expect, summary, status };

fn main() => {
    reset();

    it("addition works", expect_eq("1+1", 1 + 1, 2));
    it("strings work", expect("concat", "hello" + " world" == "hello world"));

    summary();
    status()  // 0 on pass, 1 on fail
}
```

---

## Project Status

### Completed Phases

**Phase 0**: Diagnostics stability and correctness ✓

**Phase 1**: Canonical AST module introduced ✓

- `src/main/tuff/compiler/ast.tuff` defines all core AST nodes
- Smoke tests validate AST construction and pattern matching

**Phase 2**: Compiler split into modules ✓

- `diagnostics.tuff`, `lexing.tuff`, `parsing_primitives.tuff`, `parsing_types.tuff`
- `parsing_expr_stmt.tuff`, `parsing_decls.tuff`
- `tuffc_lib.tuff` orchestrates all modules
- Tests confirm no behavioral change from monolith

**Phase 3**: Parser emits canonical AST ✓

- Parser returns `ast::Expr`, `ast::Stmt`, `ast::Decl` instead of string IR
- Spans are plumbed through for accurate error diagnostics

**Phase 4**: Analyzer pass (in progress) ✓ (partial)

- Name resolution and shadowing checks implemented
- Type checking framework in place
- Further type refinement ongoing

### In-Progress and Planned

**Phase 4 Completion**: Full type checking and annotation

- Union type narrowing
- Generic type resolution
- Array initialization tracking

**Phase 5a**: JS Emitter refinement

- Optimize generated ES Modules
- Improve error diagnostics

**Phase 5b/5c**: Additional backends (planned, not yet started)

- C emitter
- Native/LLVM support
- Self-hosting Tuff emitter (meta: Tuff→Tuff compilation)

### Known Limitations

1. **No object-oriented features** beyond class constructors and methods
2. **No lifetime tracking** — garbage-collected only (no borrowing/ownership yet)
3. **Limited iterator support** — foundation in place, rich combinators planned
4. **Incomplete standard library** — io, test, and basic utilities available; math, collections, etc. planned
5. **No macro system** — future consideration
6. **No async/await** — future consideration (may use JS Promises as foundation)
7. **Arrays and slices** lack rich operations (map, filter, etc. through iterators planned)

---

## Long-Term Roadmap

Tuff's vision is to become a versatile systems programming language with multiple compilation targets and a comprehensive standard library.

### Core Vision

1. **Comprehensive Standard Library**
   - Essential collections: `Vec`, `HashMap`, `BTreeMap`, `LinkedList`
   - String utilities: split, replace, trim, case conversion
   - Math functions: sqrt, sin, cos, floor, ceil, etc.
   - File I/O and system utilities
   - Networking and concurrency primitives (future)
   - Rich iterator and functional programming utilities

2. **Multi-Target Emission**
   - **JavaScript (ES Modules)** ✓ — Current and primary target
   - **C** (planned) — For systems programming, embedded systems, and interop with native code
   - **Tuff** (planned) — Self-hosting at the backend level; Tuff→Tuff compilation for meta-programming and advanced optimizations

### Implementation Strategy

**Phase 5-6**: Standard Library Expansion
- Build out collections, string utilities, math
- Develop `std::iter` with functional combinators
- Add file I/O via FFI (initially JS/node, later native)

**Phase 7-8**: C Backend
- Implement C emitter alongside JS emitter
- Support low-level features: pointers, manual memory management (optional)
- Enable interop between Tuff (compiled to C) and existing C libraries
- Target: single-language solution for web, CLI, and systems programming

**Phase 9+**: Tuff Backend & Advanced Features
- Implement Tuff→Tuff compiler (self-hosting at emission level)
- Enable compile-time meta-programming and code generation
- Support optional advanced features: custom allocators, inline assembly, etc.

### Community & Ecosystem

- Foster libraries and frameworks built on Tuff
- Establish package management (registry, dependency resolution)
- Build community tools: IDE support, debuggers, profilers
- Create educational resources and guides

---

## Standard Library

Tuff provides a minimal but growing standard library in `src/main/tuff/std/`:

### `std::io`

Input/output functions:

```tuff
from std::io use { print, read_line };

fn main() => {
    print("Enter your name: ");
    let name = read_line();
    print("Hello, " + name + "\n");
}
```

### `std::test`

Unit testing helpers (pure Tuff):

```tuff
from std::test use { reset, it, expect_eq, summary, status };

fn main() => {
    reset();
    it("math", expect_eq("add", 1 + 1, 2));
    summary();
    status()
}
```

### `std::prelude`

Common definitions (imports, type aliases, utilities) — automatically available in most contexts.

### Future Stdlib Modules

- **`std::collections`** — Vec, HashMap, BTreeMap, etc.
- **`std::iter`** — range, map, filter, fold, etc.
- **`std::math`** — sqrt, sin, cos, etc.
- **`std::string`** — split, contains, trim, etc.
- **`std::fs`** — file I/O (via FFI)

---

## Contributing

We welcome contributions! Here's how to get started:

1. **Read the language specification** in [LANGUAGE.md](LANGUAGE.md)
2. **Understand the architecture** (see above)
3. **Pick a task**:
   - Implement a missing language feature
   - Add tests for uncovered scenarios
   - Improve diagnostics
   - Optimize the emitter
4. **Make your changes**:
   - Add tests first (TDD)
   - Write code to pass tests
   - Ensure `npm test` passes
   - Rebuild prebuilt: `npm run build:selfhost-prebuilt`
5. **Commit**:
   ```bash
   git add .
   git commit -m "brief description of change"
   ```
6. **Submit a pull request** with a clear description

### Code Style

- Follow existing patterns in the codebase
- Keep functions focused and well-named
- Add comments for non-obvious logic
- Include tests for new features

### Testing Requirements

- New language features must have corresponding tests in `src/test/tuff/`
- Bug fixes should include a test that demonstrates the fix
- Ensure `npm test` passes in full before submitting

---

## Documentation

- **[LANGUAGE.md](LANGUAGE.md)** — Complete language specification with syntax, semantics, and examples
- **[AST_REFACTOR_PLAN.md](AST_REFACTOR_PLAN.md)** — Detailed compiler refactor roadmap and phases
- **[.github/copilot-instructions.md](.github/copilot-instructions.md)** — Architectural overview and development patterns
- **[src/main/tuff/compiler/](src/main/tuff/compiler/)** — Well-commented compiler source

---

## Project Layout

```
Tuff/
├── src/
│   ├── main/
│   │   ├── ts/              # TypeScript utilities (unused; archive)
│   │   └── tuff/
│   │       ├── compiler/    # Selfhost compiler modules
│   │       └── std/         # Standard library (test.tuff, io.tuff, etc.)
│   └── test/
│       ├── ts/              # TypeScript tests
│       └── tuff/            # Tuff test suites (.test.tuff)
├── selfhost/
│   └── prebuilt/            # Compiled .mjs modules for bootstrap
├── tools/                   # Build scripts (build_prebuilt_selfhost.ts)
├── LANGUAGE.md              # Language specification
├── AST_REFACTOR_PLAN.md     # Compiler refactor roadmap
├── package.json             # npm dependencies
└── README.md                # This file
```

---

## Quick Links

- **GitHub**: [Tuff on GitHub](https://github.com/your-repo/tuff)
- **Issues**: [Report bugs or request features](https://github.com/your-repo/tuff/issues)
- **Discussions**: [Community discussions](https://github.com/your-repo/tuff/discussions)

---

## License

Specify your project's license here (e.g., MIT, Apache-2.0).

---

## Acknowledgments

Built with ❤️ by the Tuff community. Special thanks to contributors and everyone testing the language.

---

**Last Updated**: December 2025
**Compiler Status**: Self-hosting ✓ | **Stdlib**: Growing | **Phase**: 4 (Analyzer refinement)
