# Tuff Compiler - AI Coding Agent Instructions

## Project Overview

Tuff is a **bootstrapped compiler** implementing a self-hosting Rust-influenced language via syntax morphing. The architecture uses a feedback loop where the compiler definition in `main.tuff` compiles itself into the executable compiler in `main.js`.

### Core Architecture

The project operates on a three-file system:

- **`main.tuff`** – The source language definition (Tuff syntax, ~525 lines). **This is the canonical source.**
- **`main.js`** – The compiled JavaScript compiler output (~560 lines). When executed, reads `main.tuff` and regenerates itself.
- **`main.test.js`** – Jest unit tests (54 tests, ~360 lines) with `unwrap()` helper for Result type validation.

**Critical Pattern:** Develop features using TDD:

1. Write test in `main.test.js` with expected transformation
2. Implement transformation in `main.tuff` helper functions
3. Run `npm test` to verify (tests import without triggering build)
4. Run `npm run build` to regenerate `main.js` from `main.tuff`
5. Pre-commit hook automatically runs build **twice** to ensure self-consistency

## Development Workflow

### TDD Pattern for New Features

1. **Write test first** in `main.test.js` using `unwrap()` helper:

   ```javascript
   it("should transform X to Y", () => {
     const result = compileTuffToJS("tuff input");
     expect(unwrap(result)).toBe("javascript output");
   });
   ```

2. **Add helper function** in `main.tuff` (see Helper Functions section):

   ```javascript
   fn transformMyFeature(source : String) : String => {
     // Transformation logic here
     return transformedSource;
   }
   ```

3. **Call helper** from `compileTuffToJS()` pipeline (around line 464-487)

4. **Test and build**:
   ```bash
   npm test        # Verify transformation works
   npm run build   # Regenerate main.js from main.tuff
   npm test        # Verify regenerated compiler still works
   ```

### Bootstrap Challenge Pattern

**Critical:** When adding new Tuff syntax (like `let mut`), you must:

1. First update `main.js` manually to handle the new syntax
2. Then update `main.tuff` to use the new syntax
3. Run `npm run build` to complete the bootstrap cycle

**Example:** The `let mut` for loop fix required updating `main.js` first to `.replace("mut ", "").trim()` before `main.tuff` could use `for (let mut i in 0..n)` syntax.

### Key Commands

- `npm test` – Run Jest tests (imports `compileTuffToJS` without triggering build)
- `npm run build` – Execute `node main.js` to compile `main.tuff` → `main.js`
- `npm run lint` – Check code style with ESLint
- `npm run lint:fix` – Auto-fix linting issues

**Git Hook:** Pre-commit automatically runs `npm run build` **twice** to ensure the compiler is self-consistent before commits.

## Tuff Language Features

### Result Type Error Handling

```javascript
type Result<T, X> = Ok<T> | Err<X>;
struct Ok<T> { value : T; }
struct Err<X> { err : X; }

// Functions return Result<String, String>
return { kind : "Ok", value : transformedCode };
return { kind : "Err", err : "Error message" };

// Tests use unwrap() helper
expect(unwrap(result)).toBe("expected");
```

### "is" Operator (Runtime Type Checking)

```javascript
// Tuff: value is Type → JS: value.kind === "Type"
if (result is Ok<String>) { /* ... */ }
// Compiles to: if (result.kind === "Ok") { /* ... */ }
```

### Struct Instantiation with "kind" Tag

```javascript
// Tuff: Ok<String> { value : data }
// Compiles to: { kind : "Ok", value : data }
```

### For Loop Syntax

```javascript
// Tuff: for (let mut i in 0..n) { }
// Compiles to: for (let i = 0; i < n; i = i + 1) { }
```

### Mutability Semantics

- `let x` = immutable (cannot reassign)
- `let mut x` = mutable (can reassign)
- Compiler validates at build time via `validateMutability()`

## Compiler Architecture

### Helper Function Pipeline (main.tuff lines 1-525)

The `compileTuffToJS()` function orchestrates a pipeline of transformations:

1. **`collectMutVariables()`** – Extract all `let mut` declarations
2. **`validateMutability()`** – Ensure only mut variables are reassigned (returns Result)
3. **`removeTypeDeclarations()`** – Strip `type` aliases and `struct` definitions
4. **`transformExternUse()`** – Convert `extern use X from Y` → `const X = require("Y")`
5. **`transformFnKeyword()`** – Convert `fn` → `function`
6. **`removeTypeAnnotations()`** – Remove `: String`, `: Array`, etc.
7. **`removeArrowSyntax()`** – Remove `=>` from function definitions (preserves callbacks)
8. **`removeGenericParameters()`** – Strip `<T, X>` from types
9. **`transformIsOperator()`** – Convert `value is Type` → `value.kind === "Type"`
10. **`addKindToStructInstantiation()`** – Add `kind` property to struct literals
11. **`transformForLoops()`** – Convert Rust-like for loops to JavaScript
12. **`removeMutKeyword()`** – Strip `mut` from `let mut` declarations

**Each helper:**

- Takes `source : String` as input
- Returns `String` (or `Result<String, String>` for validation)
- Uses concat strings to avoid self-transformation (e.g., `"t" + "y" + "p" + "e"`)

### Adding New Transformations

1. Create helper function in `main.tuff` (follows pattern above)
2. Add to pipeline in `compileTuffToJS()` at appropriate stage
3. Validation helpers go first, syntax transformations follow
4. Order matters: type removal before generic removal, etc.

## Code Conventions

### Style Rules (enforced by ESLint)

- **Quotes:** Double quotes only (`"string"`, not `'string'`)
- **Semicolons:** Required at end of statements
- **No unused variables:** Variables must be used or removed
- **Console warnings:** `console.*` calls trigger warnings (acceptable for build output)

### String Concatenation Pattern

To avoid self-transformation during compilation, use concatenated strings for keywords in helper functions:

```javascript
let typeKeyword = "t" + "y" + "p" + "e"; // Avoids matching type removal regex
let forStr = "for" + " "; // Avoids matching for loop transform
```

### Module Pattern

The `main.js` uses `require.main === module` guard to distinguish execution modes:

```javascript
if (require.main === module) {
  // Build logic - only runs when executed directly
}

module.exports = { compileTuffToJS, sourceFile, destinationFile };
```

- Tests **import** the module (no build side effects)
- Direct execution **triggers** the build process
- Always export the `compileTuffToJS` function and constants

## File Organization

```
.
├── main.tuff              # Source definition (development target)
├── main.js                # Compiled output (generated, don't edit directly)
├── main.test.js           # Tests for compileTuffToJS function
├── package.json           # NPM config + build/test scripts
├── jest.config.js         # Jest configuration
├── .eslintrc.json         # ESLint rules (double-quote, semi, etc.)
├── .gitignore             # Excludes node_modules, coverage/
└── .github/               # GitHub-specific files
    └── copilot-instructions.md
```

## Bootstrap Cycle Understanding

The self-hosting mechanism:

1. Developer edits `main.tuff` (Tuff language definition)
2. Developer runs `npm run build`
3. `main.js` reads `main.tuff` and calls `compileTuffToJS(tuffSource)`
4. `compileTuffToJS()` transforms `main.tuff` content to JavaScript
5. Result overwrites `main.js`
6. Next run of `npm run build` uses the newly-generated `main.js`

This creates a feedback loop where the compiler is defined in the language it compiles.

## Common Patterns

### Exporting New Functions

If adding utility functions alongside `compileTuffToJS()`:

```javascript
function myHelper(input) {
  /* ... */
}

module.exports = { compileTuffToJS, myHelper, sourceFile, destinationFile };
```

### Error Handling

Use `console.error()` in build logic for diagnostics:

```javascript
if (err) {
  console.error("Error reading source file:", err);
  process.exit(1);
}
```

---

**Version:** 0.1.0 | **Last Updated:** Jan 31, 2026
