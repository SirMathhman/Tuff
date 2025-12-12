# Tuff Compiler — Copilot Instructions

## Project Overview

**Tuff** is a bootstrap compiler for a modern systems programming language, written in TypeScript and outputting ES Modules JavaScript. The project implements the core compilation pipeline and validates a language specification (see `LANGUAGE.md`).

**Key Goal**: Create a self-hosting compiler — the TypeScript bootstrap compiler currently compiles minimal `.tuff` code; a growing subset of `selfhost/tuffc.tuff` (written in Tuff) proves the compiler can eventually compile itself.

## Architecture

### Core Compilation Pipeline

The compiler is a traditional multi-stage architecture (`src/index.ts` exports `compileToESM`):

1. **Lexer** (`src/lexer.ts`) — tokenizes `.tuff` source into `Token[]`
2. **Parser** (`src/parser.ts`) — builds an AST from tokens
3. **Analyzer** (`src/analyzer.ts`) — type-checks and validates the AST
4. **Emitter** (`src/emitter.ts`) — generates ES Module JavaScript

All stages collect diagnostics into a shared `Diagnostics` object; errors halt compilation gracefully.

### Key Data Structures

- **AST** (`src/ast.ts`) — Expression-based tree; blocks are expressions; functions are first-class
- **Tokens** (`src/tokens.ts`) — Token definitions with position tracking (file, line, column)
- **Diagnostics** (`src/diagnostics.ts`) — collects and deduplicates compile errors/warnings
- **Pretty Diagnostics** (`src/pretty_diagnostics.ts`) — formats error messages with code frame carets

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
bun run src/cli.ts input.tuff --outdir out   # compile a single file to .mjs
```

### Test Structure

Tests live in `tests/*.test.ts` and use Bun's test API. Key test files:

- **`lexer.test.ts`** — token stream validation
- **`parser.test.ts`** — AST parsing correctness (block expressions, `if` tails, match arms, etc.)
- **`analyzer.test.ts`** — type-checking, scope validation, error cases
- **`emit.test.ts`** — JS output validation
- **`e2e.test.ts`** — end-to-end compiler output
- **`selfhost.test.ts`** — validates `selfhost/tuffc.tuff` can compile a minimal program
- **`selfhost_stage2.test.ts`** — stage 2: selfhost compiler compiles itself

**Helper**: `tests/helpers.ts` exports `compile(src, filePath?)` — shortcut to run the full pipeline.

### Diagnostics Tests

Special test files validate error messages:

- **`pretty_diagnostics.test.ts`** — error formatting with line/column/caret
- **`selfhost_diagnostics.test.ts`** — ensures selfhost compiler error messages are accurate

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

1. **Extend Lexer** if new tokens are needed (`src/tokens.ts`, `src/lexer.ts`)
2. **Update Parser** to handle new syntax (`src/parser.ts`)
3. **Add Analyzer Rules** for type-checking and validation (`src/analyzer.ts`)
4. **Implement Emitter** to generate JS (`src/emitter.ts`)
5. **Write Tests** at each stage (use `tests/helpers.ts::compile()` for E2E)
6. **Update LANGUAGE.md** with language semantics

### Adding a Test

Use Bun's test API. Example:

```typescript
import { describe, test, expect } from "bun:test";
import { compile } from "./helpers";

describe("my feature", () => {
  test("case 1", () => {
    const { js, diagnostics } = compile("fn main() => 42");
    expect(diagnostics).toHaveLength(0);
    expect(js).toContain("main");
  });

  test("error case", () => {
    const { diagnostics } = compile("invalid syntax !!!!");
    expect(diagnostics.length).toBeGreaterThan(0);
  });
});
```

### Selfhost Compiler (`selfhost/tuffc.tuff`)

The selfhost is a **restricted Tuff compiler** that validates bootstrapping. It currently compiles only:

```tuff
fn main() => <expr>
fn main() => { <expr> }
```

To extend it:

1. Add parsing/emission logic to `selfhost/tuffc.tuff`
2. Update the **Stage 1** test (`selfhost.test.ts`) to verify output
3. Run **Stage 2** test (`selfhost_stage2.test.ts`) to verify selfhost can compile itself

## Critical Files & Cross-File Communication

| File                 | Purpose               | Depends On                              |
| -------------------- | --------------------- | --------------------------------------- |
| `src/index.ts`       | Pipeline orchestrator | Lexer → Parser → Analyzer → Emitter     |
| `src/lexer.ts`       | Tokenization          | `tokens.ts`, `diagnostics.ts`           |
| `src/parser.ts`      | Syntax → AST          | `tokens.ts`, `ast.ts`, `diagnostics.ts` |
| `src/analyzer.ts`    | Type-check & scope    | `ast.ts`, `diagnostics.ts`              |
| `src/emitter.ts`     | AST → JS              | `ast.ts`                                |
| `src/ast.ts`         | AST node definitions  | (no deps)                               |
| `src/tokens.ts`      | Token types           | (no deps)                               |
| `src/diagnostics.ts` | Error collection      | (no deps)                               |
| `src/cli.ts`         | CLI entry point       | `index.ts`, `pretty_diagnostics.ts`     |

**Data Flow**: Source → Tokens → AST → Analyzer Checks → JS Emit → Diagnostics logged at each stage.

## Standard Library & FFI

The language provides standard modules:

- **`std::io`** — `print`, `read_line` (extern wrappers)
- **`std::test`** — unit testing helpers in pure Tuff (`src/main/tuff/std/test.tuff`)
- **`std::prelude`** — common definitions (`src/main/tuff/std/prelude.tuff`)

**FFI Implementation**: External functions/types are declared with `extern` and resolved at emit time. The emitter generates JS that calls external functions directly (they exist in the JS runtime).

## Commit Conventions

Commits should reference the feature/fix clearly:

```
language: remove import keyword; standardize on from-use
parser: add support for union type patterns
analyzer: enforce no-shadowing rule
emitter: generate proper module exports
```

This helps track feature provenance across the multi-stage architecture.
