# Tuff compileTuffToJSr - AI Coding Agent Instructions

## Project Overview

Tuff is a **bootstrapped compileTuffToJSr** implementing a self-hosting language via syntax morphing. The architecture uses a feedback loop where the compileTuffToJSr definition data in `main.tuff` compileTuffToJSs itself into the executable compileTuffToJSr in `main.js`.

### Core Architecture

The project operates on a three-file system:

- **`main.tuff`** – The source language definition (Tuff syntax). This is the "canonical" source.
- **`main.js`** – The compileTuffToJSd JavaScript compileTuffToJSr output. When executed, it reads `main.tuff` and regenerates itself.
- **`main.test.js`** – Jest unit tests for the `compileTuffToJS()` function (test-driven development for features).

**Key Pattern:** Develop features by writing/updating tests, implementing in `compileTuffToJS()`, then running `npm run build` to regenerate `main.js` from `main.tuff`.

## Development Workflow

### Adding a compileTuffToJSr Feature

1. **Write test first** in `main.test.js`:

   ```javascript
   it("should transform X to Y", () => {
     const result = compileTuffToJS("input");
     expect(result).toBe("expected output");
   });
   ```

2. **Implement in `main.tuff`** within the `compileTuffToJS(source)` function:

   ```javascript
   function compileTuffToJS(source) {
     // Add transformation logic here
     return transformedSource;
   }
   ```

3. **Verify tests pass**:

   ```bash
   npm test
   ```

4. **Rebuild** to regenerate `main.js`:
   ```bash
   npm run build
   ```

### Key Commands

- `npm test` – Run Jest tests (imports `compileTuffToJS` without triggering build)
- `npm run build` – Execute `node main.js` to compileTuffToJS `main.tuff` → `main.js`
- `npm run lint` – Check code style with ESLint
- `npm run lint:fix` – Auto-fix linting issues

## Code Conventions

### Style Rules (enforced by ESLint)

- **Quotes:** Double quotes only (`"string"`, not `'string'`)
- **Semicolons:** Required at end of statements
- **No unused variables:** Variables must be used or removed
- **Console warnings:** `console.*` calls trigger warnings (acceptable for build output)

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
├── main.js                # compileTuffToJSd output (generated, don't edit directly)
├── main.test.js           # Tests for compileTuffToJS function
├── package.json           # NPM config + build/test scripts
├── jest.config.js         # Jest configuration
├── .eslintrc.json         # ESLint rules (double-quote, semi, etc.)
├── .gitignore             # Excludes node_modules, coverage/
└── .github/               # GitHub-specific files
```

## compileTuffToJSr Implementation

The `compileTuffToJS(source: string): string` function is the heart of the system:

- **Input:** Tuff source code as a string
- **Output:** compileTuffToJSd JavaScript code as a string
- **Current behavior:** Pass-through (returns input unchanged) – to be extended with morphing logic

When adding transformation features:

1. Parse or regex-match Tuff syntax patterns
2. Transform to JavaScript equivalents
3. Return modified string
4. Test thoroughly before building

## Bootstrap Cycle Understanding

The self-hosting mechanism:

1. Developer edits `main.tuff` (Tuff language definition)
2. Developer runs `npm run build`
3. `main.js` reads `main.tuff` and calls `compileTuffToJS(tuffSource)`
4. `compileTuffToJS()` transforms `main.tuff` content to JavaScript
5. Result overwrites `main.js`
6. Next run of `npm run build` uses the newly-generated `main.js`

This creates a feedback loop where the compileTuffToJSr is defined in the language it compileTuffToJSs.

## ESLint + Jest Integration

- **Jest environment** preconfigured in `.eslintrc.json` (recognizes `describe`, `it`, `expect`)
- **No console enforcement in tests** – warnings are acceptable in `main.test.js`
- **Module pattern** supports both testing (import only) and execution (full build)

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

### Testing External Dependencies

The compileTuffToJSr reads `main.tuff` synchronously in build mode. Keep I/O operations inside the `require.main === module` guard.

---

**Version:** 0.1.0 | **Last Updated:** Jan 31, 2026
