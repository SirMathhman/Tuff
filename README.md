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
6. [Standard Library](#standard-library)
7. [Contributing](#contributing)
8. [Documentation](#documentation)

---

## Quick Start

### Prerequisites

- **Node.js** (for tests + build tooling + running compiled output)
  - Recommended: Node 20+ (ESM-friendly)
- Optional: **Python 3** (only for the local task manager `tasks.py`)

### Installation

Clone the repository:

```bash
git clone https://github.com/SirMathhman/Tuff.git
cd Tuff
npm ci
```

### Running Tests

```bash
# Run all tests (TypeScript + Tuff) (quiet)
npm run test

# Run all tests with verbose output
npm run test:verbose

# Run the full bootstrap check (tests + regenerate selfhost/prebuilt)
npm run check:bootstrap

# Rebuild and then assert that selfhost/prebuilt has no diff
npm run check:prebuilt

# Rebuild the prebuilt compiler from source
npm run build:selfhost-prebuilt
```

### Writing Your First Program

Create `hello.tuff`:

```tuff
from std::io use { print };

fn main() : I32 => {
    print("Hello, Tuff!\n");
    0
}
```

Compile and run:

```bash
# Using the self-hosting compiler (via prebuilt)
node selfhost/prebuilt/tuffc.mjs hello.tuff hello.mjs

# Lint only (parse + analyze), without emitting output
node selfhost/prebuilt/fluff.mjs hello.tuff

# Run the output
node hello.mjs
```

For CLI help and options (config, diagnostics format):

```bash
node selfhost/prebuilt/tuffc.mjs
node selfhost/prebuilt/fluff.mjs
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

The self-hosting compiler is located in `src/main/tuff/compiler/` and is split into focused modules:

| Area     | Module                    | Purpose                                                  |
| -------- | ------------------------- | -------------------------------------------------------- |
| AST      | `ast.tuff`                | Canonical AST definitions                                |
| Util     | `util/lexing.tuff`        | Tokenization helpers                                     |
| Util     | `util/diagnostics.tuff`   | Errors/warnings + formatting                             |
| Parsing  | `parsing/primitives.tuff` | Low-level parsing utilities                              |
| Parsing  | `parsing/types.tuff`      | Type-expression parsing                                  |
| Parsing  | `parsing/expr_stmt.tuff`  | Expression + statement parsing                           |
| Parsing  | `parsing/decls.tuff`      | Top-level declarations + imports                         |
| Analysis | `analyzer.tuff`           | Scope/type checks + lint plumbing                        |
| Emit     | `emit/ast_js.tuff`        | AST → JS ESM emitter                                     |
| Driver   | `tuffc_lib.tuff`          | Multi-file orchestration + emit                          |
| Config   | `build_config.tuff`       | `build.json` discovery + Fluff severity config           |
| CLI      | `tuffc.tuff`              | Compiler CLI (compiled to `selfhost/prebuilt/tuffc.mjs`) |
| CLI      | `fluff.tuff`              | Linter CLI (compiled to `selfhost/prebuilt/fluff.mjs`)   |

Note: `analyzer.tuff` is being actively split into smaller submodules under `src/main/tuff/compiler/analyzer/` (e.g. `analyze_expr_stmt.tuff`, `checks.tuff`, `infer_basic.tuff`, `typecheck.tuff`, `scope.tuff`, `deprecation.tuff`, `typestrings.tuff`, `fluff.tuff`) to keep individual files small and focused.

### Bootstrap Strategy

The compiler achieves self-hosting through a **prebuilt artifact strategy**:

1. **Prebuilt**: A checked-in, already-compiled JS version of the selfhost compiler lives in `selfhost/prebuilt/`.
2. **Self-compile**: The prebuilt compiler compiles the compiler sources in `src/main/tuff/compiler/`.
3. **Fixed point**: The newly compiled compiler compiles itself again; tests verify the outputs stabilize.

Prebuilt artifacts are stored in `selfhost/prebuilt/` and include all compiled `.mjs` modules (not just `tuffc.mjs`). This allows tests to run without compiling on first run.

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

The CLI can also emit machine-friendly diagnostics:

- `--format human` (default): the multi-line code frame shown above
- `--format json`: prints one JSON object per warning (one line each); compilation errors are thrown as a single JSON object string

JSON shape (minimal, stable):

```json
{ "level": "warning", "text": "..." }
```

### Lint configuration

Fluff is configured via `build.json`, auto-discovered upward from the input file directory.

Supported shape (all keys optional):

```json
{
    "fluff": {
        "unusedLocals": "off" | "warning" | "error",
        "unusedParams": "off" | "warning" | "error"
    }
}
```

Notes:

- Defaults to `off` for all lints if no `build.json` is found.
- `error`-level lints fail the run, but diagnostics are still accumulated.
- There are no lint-related CLI flags or subcommands on `tuffc`; linting is done via `fluff`.

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

Methods declared inside a `class fn` are just local functions captured as function-valued fields and invoked with normal dot-call syntax.

> Note: generic local methods (e.g. `fn m<T>(...)`) are not supported yet in the bootstrap compiler.

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
# Run all tests (TypeScript + Tuff) (quiet)
npm run test

# Run all tests with verbose output
npm run test:verbose

# Run only TypeScript tests
npm run test -- src/test/ts/**

# Run specific test file
npm run test -- src/test/ts/selfhost.test.ts
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
- **rt_stdlib_test_runner_infra.test.ts** — validates Node runtime helpers used by the (future) Tuff-native test runner (file discovery, copying, module execution)

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

**Phase 4**: Analyzer pass ✓ (complete)

- Name resolution and shadowing checks implemented
- Type checking framework with full type inference
- Union type narrowing and pattern matching
- Generic type resolution and instantiation
- Array initialization tracking and validation

### Phase 5: Post-Bootstrap Expansion

**For detailed implementation plan, see [ROADMAP.md](ROADMAP.md)** — focuses on three backends (JS, C, Tuff) over 12 weeks.

**Phase 5a**: JS Emitter refinement ✓ (partial)

- Reduce unnecessary parentheses in generated code ✓
- Dead code elimination hints ✓
- Full ES Module optimization (planned)

**Phase 5-6**: Standard Library Expansion ✓ (in progress)

- Iterator library with map/filter/fold ✓
- Test framework and utilities ✓
- Collections (Vec, HashMap) — planned
- String utilities — planned
- Math module — planned
- File I/O — planned

**Phase 5b/5c**: Additional backends (not yet started)

- C emitter (Phase 7-8 planned)
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

For longer-horizon work items, see `TASKS.md` / `tasks.py`.

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

### `std::iter`

Minimal iterator utilities (currently: `range`, `map`, `filter`, `fold`).

```tuff
from std::iter use { range };

fn main() => {
    let sum = 0;
    let r = range(0, 5);
    while (r.has_next()) {
        sum = sum + r.next();
    }
    sum // 10
}
```

### Future Stdlib Modules

- **`std::collections`** — Vec, HashMap, BTreeMap, etc.
- **`std::iter`** — more iterator utilities and richer iterator types
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
   - Verify prebuilt is up-to-date (no diff): `npm run check:prebuilt`
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
- **[.github/copilot-instructions.md](.github/copilot-instructions.md)** — Architectural overview and development patterns
- **[src/main/tuff/compiler/](src/main/tuff/compiler/)** — Well-commented compiler source

---

## Project Layout

```
Tuff/
├── .dist/                    # Test staging output (generated)
├── src/
│   ├── main/
│   │   └── tuff/
│   │       ├── compiler/    # Selfhost compiler modules
│   │       └── std/         # Standard library (test.tuff, io.tuff, etc.)
│   └── test/
│       ├── ts/              # TypeScript tests
│       └── tuff/            # Tuff test suites (.test.tuff)
├── rt/                       # JS runtime modules used by emitted code
├── selfhost/
│   └── prebuilt/            # Compiled .mjs modules for bootstrap
├── tools/                   # Build scripts (build_prebuilt_selfhost.ts)
├── LANGUAGE.md              # Language specification
├── package.json             # npm dependencies
└── README.md                # This file
```

---

## Quick Links

- **GitHub**: [SirMathhman/Tuff](https://github.com/SirMathhman/Tuff)
- **Issues**: [Report bugs or request features](https://github.com/SirMathhman/Tuff/issues)
- **Discussions**: [Community discussions](https://github.com/SirMathhman/Tuff/discussions)

---

## License

No license file is currently included in this repository.

---

## Acknowledgments

Built with ❤️ by the Tuff community. Special thanks to contributors and everyone testing the language.

---

**Last Updated**: December 2025
**Compiler Status**: Self-hosting ✓ | **Stdlib**: Growing | **Phase**: 4 (Analyzer refinement)
