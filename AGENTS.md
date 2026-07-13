# Tuff — Agent Instructions

A minimalist compiler that transforms a custom DSL into executable JavaScript.

## Quick Start

```bash
pnpm install
npm run test    # Run tests (Bun)
npm run lint    # Lint with --fix
npm run cpd     # Check for code duplication
```

## Architecture

- **`index.js`** — Single-file compiler exposing `compile(source)` which validates and transforms DSL source to JS string. Returns the generated JavaScript or throws on validation failure.
- **`index.test.js`** — Tests using Bun's built-in test runner (`bun:test`). Test helper `expectValid()` executes generated code via `new Function()`.

### Compiler Pipeline

`compile(source)` executes three stages in order:

1. **Validation** — `validateVarAssignments()` checks type compatibility and immutability rules, then `validateSource()` walks the source character-by-character checking for invalid syntax.
2. **Transformation** — `transformBlocks()` recursively processes `{ ... }` blocks, stripping type suffixes and annotations via `stripTypeSuffix()` and `stripTypedSyntax()`. Statement blocks become IIFEs; expression-only blocks become grouped expressions with parentheses.
3. **Wrapping** — Top-level output is wrapped in a `(function(){...})()` IIFE if it contains statements, otherwise emitted as a bare `return` expression. Both paths inject `_tokens` and `read()` runtime helpers.

## DSL Overview

The language supports:

### I/O
- `read()` / `read<T>()` — consume sequential tokens from stdin (parsed as integers). The generated JS receives `stdIn` string; the compiler splits on whitespace into a `_tokens` array consumed via `shift()`.
- `read<Bool>()` — consume a boolean token (`"true"` → `1`, `"false"` → `0`).

### Variables
- `let x = expr;` — immutable variable declarations. Use `let mut x = expr;` for mutable variables that allow reassignment.
- Compound assignments: `+=`, `-=`, `*=`, `/=` on mutable variables.
- Type annotations: `let x : U8 = ...` or `read<U8>()`. Types include `U8`, `U16`, `U32`, `I8`, `I16`, `I32`, `F32`, and `Bool`.
- Type compatibility: a wider type cannot be assigned to a narrower declaration (e.g., `let x : U8 = read<U16>()` is invalid). A narrower type can be assigned to a wider declaration.
- Variable shadowing: redeclaring a variable with `let` is allowed; block-scoped shadows don't leak.
- Bare let statements (no trailing expression) return `0`.

### Arrays
- Array literals: `[a, b, c]` with indexing via `arr[0]`.
- Typed array declarations: `let arr : [I32; 2] = [read(), read()];` — size is validated at compile time.
- `.length` property: `arr.length` returns array size.

### Control Flow
- `{ ... }` — block expressions: statement blocks become IIFEs, expression-only blocks become grouped expressions. Max nesting depth is **2**.
- `if (cond) expr else expr` — conditional expressions (lowered to JS ternary). `else` is optional; missing else branches evaluate to `0`. If branches contain `break`/`continue`/`return`, lowered to JS `if/else` statements instead.
- `while (cond) body` — indefinite iteration. Body can be a block `{ ... }` or a single expression.
- `for (i in start..end) body` — definite iteration over a range. Range can be literal (`0..read()`) or a variable reference (`let range = 0..10; for (i in range) ...`).
- `break` — exit enclosing `while` or `for` loop.
- `continue` — skip to next loop iteration.
- `yield expr;` — early return from a block (lowered to `return` in an IIFE).
- `return expr;` — explicit return in function bodies.

### Functions
- `fn name(params) => expr;` — function declarations (lowered to JS `function` with `return`).
- `fn name(param : Type) : ReturnType => expr;` — typed parameters and optional return type annotation.
- Functions support recursive calls.
- Block bodies with `return` statements: `fn name() => { if (cond) return val }`.

### Structs
- `struct Name { field : Type, field2 : Type }` — struct declarations (evaluates to `0`).
- Struct instantiation: `let s = Name { field : val };`.
- Field access: `s.field` returns the field value.
- Duplicate field names and unknown types are validation errors.

### Expressions
- Boolean literals (`true` / `false`) and logical operators (`||`, `&&`).
- Equality comparison: `==` returns `1` (true) or `0` (false), never JS `true`/`false`.
- Arithmetic operators and multi-character identifiers (alphabetic only).
- Typed number literals: `100U8`, `50I16`, etc. (validated against type range at compile time, then stripped from output).
- Range literals: `start..end` (used in `for` loops or `let` declarations).
- Address-of operator: `&x` produces a unique pointer value per variable.
- Mutable references: `let y : &mut I32 = &mut x; *y = val;` — dereference-assignment writes through to the original variable.

## Conventions

- **No regex literals or `RegExp` constructor** — ESLint rule enforces this; use string iteration instead.
- **Max nesting depth: 2** — enforced by ESLint (`max-depth`).
- **CommonJS modules** with named exports (`export function compile`). Note: project uses ESM config files but outputs CommonJS (`"type": "commonjs"` in package.json).
- **Test pattern:** `expectValid(source, stdIn, expectedExitCode)` for happy paths, `expectInvalid(source)` for validation errors. Generated code is executed at runtime via `new Function("stdIn", generated)(stdIn)`.
- **Missing features roadmap:** see [`FEATURES_MISSING.md`](./FEATURES_MISSING.md) for planned C-like features not yet implemented.

## Gotchas

- See `/memories/` (user memory) for ASI pitfalls with dynamically generated JS and parser queue draining patterns.
- Pre-commit hooks run test → lint → cpd; all must pass before commit succeeds (`.github/hooks/hooks.json`).
- The `validateSource` function uses character-by-character iteration — no regex parsing. All token matching is done via string comparison helpers (`skipKeyword`, `tryMatchTypedRead`, etc.).
- **Don't think, measure!** — When stuck on a bug or unexpected behavior, add strategic `console.log` statements to trace runtime values and execution flow rather than manually reasoning through the code. Instrument the compiler pipeline (validation, transformation, wrapping) to observe what's actually happening.
