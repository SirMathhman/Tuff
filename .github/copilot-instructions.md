# Tuff Compiler — Copilot Instructions

## Project Overview

**Tuff** is a self-hosting compiler for a modern systems programming language, written in Tuff and outputting ES Modules JavaScript. The project implements a traditional multi-stage compilation pipeline and validates a language specification (see `LANGUAGE.md`).

**Key Goal**: Bootstrap goal achieved — the compiler is now self-hosting. The selfhost compiler (`src/main/tuff/compiler/`) compiles `.tuff` code and can compile itself. This directory contains modules (lexing, parsing, emission, diagnostics, AST definitions).

## Architecture

### Selfhost Compiler (Tuff-written)

The compiler is split into focused modules under `src/main/tuff/compiler/`:

1. **ast.tuff** — canonical AST definitions (structs, type aliases, constructor helpers)
2. **lexing.tuff** — tokenization; exports functions like `is_digit`, `is_ident_start`, `skip_ws`
3. **parsing_primitives.tuff** — low-level parsing (tokens, positions, panic/error handling)
4. **parsing_types.tuff** — type expression parsing
5. **parsing_expr_stmt.tuff** — expression and statement parsing; `parse_expr`, `parse_main_body`
6. **parsing_decls.tuff** — declaration parsing (functions, structs, imports)
7. **diagnostics.tuff** — error/warning helpers and formatting
8. **emit_ast_js.tuff** — phase 3 scaffold: AST → JS emitter (partial, for testing)
9. **tuffc_lib.tuff** — facade that orchestrates the modules
10. **tuffc.tuff** — main entry point

Each stage collects diagnostics; errors halt compilation gracefully.

### Key Data Structures

- **AST** (`src/main/tuff/compiler/ast.tuff`) — Expression-based tree; blocks are expressions; functions are first-class. Type aliases (`BinOp`, `Expr`, `Stmt`, `Decl`) map to struct variants.
- **Span** — source location as `(startOffset, endOffset)` half-open interval; stored as tagged union `SpanVal<(I32, I32)>`
- **Tokens** — input stream of token structs with position tracking
- **Diagnostics** — error/warning collection (file, line, column, caret formatting)
- **Prebuilt artifacts** (`selfhost/prebuilt/`) — pre-compiled `.mjs` modules for all compiler source files (enables bootstrap without self-compilation on first run)

### Language Features (Tuff Bootstrap Subset)

The language is expression-oriented with immutable-by-default variables:

- Primitives: `I32`, `U32`, `Bool`, `String`, `F32`, `Void`
- Composites: structs, tuples, unions (`Option<T>`, `Result<T, E>`)
- Control: `if`/`else` expressions, `while`/`loop` statements, `match` expressions
- Functions: named (`fn`), lambdas, closures, `class fn` (constructor sugar)
- Generics: `<T, U>` on functions, structs, classes
- FFI: `extern fn`, `extern from`, `extern type` for interop with JS
- Modules: file-based implicit modules; `from X use { ... }` imports

**No variable shadowing allowed** — a name cannot be redeclared in enclosing/nested scopes.

## Workflow & Testing

### Build & Run

```bash
bun test              # run all tests (uses Bun test runner)
bun run build:selfhost-prebuilt  # regenerate selfhost/prebuilt/ (stage2→stage4, then copy to prebuilt)
```

### Test Structure

Tests are organized by layer:

#### TypeScript Tests (`src/test/ts/*.test.ts`)

Active tests:

- **`selfhost.test.ts`** — validates `selfhost/tuffc.tuff` can compile a minimal program (Stage1)
- **`selfhost_stage2.test.ts`** — Stage2: selfhost compiler compiles itself
- **`selfhost_stage3.test.ts`** — Stage3/4 fixed-point: verify `stage3 == stage4` (both compiler entry and lib modules)
- **`selfhost_diagnostics.test.ts`** — error message formatting validation
- **`selfhost_module_split.test.ts`** — verify module split architecture
- **`selfhost_types.test.ts`** — type annotation and generic support
- **`tuff_tests_runner.test.ts`** — compiles and runs all `.tuff` test suites

#### Tuff Tests (`src/test/tuff/*.test.tuff`)

- **`ast_emit_js.test.tuff`** — phase3 scaffold: tests AST → JS emission (int, bool, string, binary, call, if)
- **`ast_smoke.test.tuff`** — basic AST node creation and accessor helpers
- **`selfhost_char.test.tuff`** — char literal support
- **`selfhost_structs_unions.test.tuff`** — struct/union construction and field access
- **`selfhost_tuples.test.tuff`** — tuple literals and `.0`/`.1` indexing

**Helper**: `src/test/ts/selfhost_helpers.ts` stages prebuilt compiler + test files into `.dist/` for test execution.

### Staging & Prebuilt Management

Tests use a staged environment (`.dist/tuff-tests/`) where:

1. `src/test/ts/selfhost_helpers.ts` copies prebuilt `.mjs` modules
2. `.tuff` test files are compiled using the prebuilt compiler
3. Compiled output (stage1/stage2/stage3/stage4) is generated on-the-fly

**Important**: After splitting the compiler into modules, `selfhost/prebuilt/` must include **all** emitted `.mjs` files (not just `tuffc.mjs`/`tuffc_lib.mjs`), or runtime ESM imports (e.g., `./diagnostics.mjs`) fail.

## Key Patterns & Conventions

### Block Expressions & Tail Values

Unlike C/Java, **blocks must explicitly evaluate to a value** by omitting the final semicolon:

```tuff
let x = { let y = 10; y };         // OK: y (no semicolon) is the value
let x = { let y = 10; };           // Error: trailing semicolon; block has no value
```

Parser validates this; analyzer enforces type compatibility. See `parser.test.ts:14` for examples.

### If Expressions Require Else

An `if` used as a value **must have an `else`** (parse-time check):

```tuff
let x = if (cond) 1 else 2;        // OK
let x = if (cond) 1;               // Error at parse time
```

### Variable Shadowing is Forbidden

The language enforces **no shadowing** — a name cannot appear in nested scopes. This is a design choice for clarity. Analyzer checks enclosing and nested scopes.

### Match Arms Must Be Exhaustive

`match` expressions require all union variants to be handled or use `_` wildcard. Analyzer validates exhaustiveness.

### Type Inference & Default Types

- Unsuffixed integer literals → `I32` by default
- Context-driven inference (e.g., `10U8 + 100` → both are `U8`)
- Explicit suffixes: `42U32`, `3.14F64`

### Functions as Values

Functions are first-class. **Local variables and functions share the same namespace** — you cannot declare both a function and a variable with the same name. This is enforced in the analyzer.

### Generic Functions Require Type Parameters at Assignment

```tuff
fn id<T>(x: T) : T => x;
let f = id;              // Error: type parameters not specified
let f : (I32) => I32 = id<I32>;  // OK
```

## Development Patterns

### Adding a Language Feature

1. **Extend Lexer** if new tokens are needed (`src/main/tuff/compiler/lexing.tuff`)
2. **Update Parser** to handle new syntax (`src/main/tuff/compiler/parsing_expr_stmt.tuff` or `parsing_decls.tuff`)
3. **Add Analyzer Rules** for type-checking and validation (currently in TypeScript bootstrap; will move to Tuff later)
4. **Implement Emitter** to generate JS (`src/main/tuff/compiler/emit_ast_js.tuff` for phase3 scaffold)
5. **Write Tests** — add `.tuff` test file or add TS tests that stage the prebuilt compiler
6. **Update LANGUAGE.md** with language semantics

### Adding a Test

For `.tuff` tests, use the `std::test` framework:

```tuff
from std::test use { reset, suite, it, expect_eq, summary, status };

fn main() : I32 => {
  reset();
  suite("my feature");

  it("case 1", expect_eq("result", actual_value, expected_value));
  it("case 2", expect_eq("math", 1 + 1, 2));

  summary();
  status()  // 0 on pass, 1 on fail
}
```

For TypeScript tests, use Bun's test API and stage the prebuilt compiler via `selfhost_helpers.ts`.

### Selfhost Compiler Architecture

The selfhost compiler is split into **focused modules** to keep file size manageable:

- Each module (`lexing.tuff`, `parsing_primitives.tuff`, etc.) is independently compilable
- `tuffc_lib.tuff` is a **facade** that imports all modules and orchestrates the pipeline
- `tuffc.tuff` is the **entry point** that calls `tuffc_lib`

**Cross-module constraints**:

- **Type aliases are not runtime exports**: importing `type Expr` at runtime fails (use constructor functions instead)
- **Union struct variants generate runtime constructors** during lowering: avoid emitting duplicate declarations by not re-declaring local type aliases
- **If-as-expression limitations**: the current selfhost JS emitter does not fully support `if` as an expression; use mutable accumulators instead

### Rebuilding the Prebuilt Compiler

After modifying compiler source files, regenerate prebuilt artifacts:

```bash
bun run build:selfhost-prebuilt
```

This:

1. Reads `.tuff` source from `src/main/tuff/compiler/`
2. Uses the current prebuilt to compile itself (Stage2)
3. Copies all emitted `.mjs` modules to `selfhost/prebuilt/`

Ensure all compiler modules are copied (not just `tuffc.mjs`/`tuffc_lib.mjs`) by checking `tools/build_prebuilt_selfhost.ts`.

## Critical Files & Cross-File Communication

| File                                             | Purpose                      | Depends On                                                          |
| ------------------------------------------------ | ---------------------------- | ------------------------------------------------------------------- |
| `src/main/tuff/compiler/ast.tuff`                | AST node definitions         | (no deps)                                                           |
| `src/main/tuff/compiler/lexing.tuff`             | Tokenization                 | `diagnostics.tuff`                                                  |
| `src/main/tuff/compiler/parsing_primitives.tuff` | Low-level parsing            | `diagnostics.tuff`, `lexing.tuff`                                   |
| `src/main/tuff/compiler/parsing_types.tuff`      | Type expression parsing      | `parsing_primitives.tuff`                                           |
| `src/main/tuff/compiler/parsing_expr_stmt.tuff`  | Expr/stmt parsing            | `parsing_primitives.tuff`, `parsing_types.tuff`, `diagnostics.tuff` |
| `src/main/tuff/compiler/parsing_decls.tuff`      | Declaration parsing          | `parsing_expr_stmt.tuff`, `parsing_primitives.tuff`                 |
| `src/main/tuff/compiler/diagnostics.tuff`        | Error/warning collection     | (no deps)                                                           |
| `src/main/tuff/compiler/emit_ast_js.tuff`        | Phase3 scaffold: AST → JS    | `ast.tuff` (imports only via untyped params)                        |
| `src/main/tuff/compiler/tuffc_lib.tuff`          | Compiler facade/orchestrator | All parsing/diagnostics modules                                     |
| `src/main/tuff/compiler/tuffc.tuff`              | Main entry point             | `tuffc_lib.tuff`                                                    |
| `tools/build_prebuilt_selfhost.ts`               | Prebuilt rebuild script      | Invokes selfhost compiler via `tuffc.mjs`                           |
| `src/test/ts/selfhost_helpers.ts`                | Test staging helper          | Copies prebuilt → `.dist/`                                          |

**Data Flow**: Source → Tokens → AST → (future: Analyzer) → JS Emit → Diagnostics logged at each stage.

## Standard Library & FFI

The language provides standard modules:

- **`std::io`** — `print`, `read_line` (extern wrappers)
- **`std::test`** — unit testing helpers in pure Tuff (`src/main/tuff/std/test.tuff`)
- **`std::prelude`** — common definitions (`src/main/tuff/std/prelude.tuff`)

**FFI Implementation**: External functions/types are declared with `extern` and resolved at emit time. The emitter generates JS that calls external functions directly (they exist in the JS runtime).

## Task Management

Tuff uses a SQLite-backed task manager (`tasks.py`) to track **long-term strategic items** — language features, stdlib expansion, tooling, and multi-year roadmap goals. This is distinct from short-term work-in-progress tracking.

### When to Use the Task Manager

Use `python tasks.py` for:

- **Language features** that span multiple phases or require architectural decisions (e.g., "C Backend Implementation")
- **Stdlib expansion** goals (e.g., "Standard Library Expansion (Phase 5-6)")
- **Long-horizon infrastructure** (e.g., "IDE/Editor Language Server Protocol (LSP)")
- **Multi-phase compiler work** (e.g., phases 5-9+)

Do **NOT** use the task manager for:

- Daily/weekly development todos (use git branches and commit messages instead)
- In-PR work that will be completed in a single session
- One-off bug fixes that fit in a single commit

### Task Manager Commands

```bash
# List all tasks
python tasks.py readAll

# Filter by status
python tasks.py readAll --status not-started
python tasks.py readAll --status in-progress
python tasks.py readAll --status completed

# Create a new long-term task
python tasks.py create "Language feature or infrastructure goal" -d "Optional details" -s not-started

# Remove a task (once fully shipped and merged)
python tasks.py delete <task_id>
```

### Task Lifecycle

1. **Create**: When a multi-phase feature or long-term goal is identified
2. **Update status**: Mark `in-progress` when work begins; `completed` when shipped
3. **Delete**: Remove only after the feature is fully merged and validated in testing
4. **Archival**: Completed tasks are not deleted immediately; rather, they are kept as history until removed

### Integration with Development

- Tasks are **informational** — they guide the roadmap and priority-setting, but do not force commit messages or branch naming
- After completing work for a task, delete it to keep the active task list lean
- Tasks can reference multiple PRs; consolidate their work into a single task update when possible

## Commit Conventions

Commits should reference the feature/fix clearly:

```
language: remove import keyword; standardize on from-use
parser: add support for union type patterns
analyzer: enforce no-shadowing rule
emitter: generate proper module exports
```

This helps track feature provenance across the multi-stage architecture. For multi-phase work tracked in `tasks.py`, mention the task in the commit message when appropriate:

```
feat(phase-5): implement iterators with map/filter/fold
Advances task #22: Iterator library with functional combinators
```
