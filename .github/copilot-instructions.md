# Tuff - AI Coding Agent Instructions

## Project Overview

Tuff is a typed expression interpreter written in TypeScript that evaluates expressions and returns numeric values. It supports functions, lambdas, structs, modules, arrays, type checking, and control flow.

## Architecture & Design Patterns

### Interpreter Core

- **Entry point**: [src/utils/interpret.ts](../src/utils/interpret.ts) → [src/app.ts](../src/app.ts) `interpretWithScope()`
- **Value system**: Everything evaluates to a `number` (primitive values, IDs for objects/functions/strings, 0 for no-ops)
- **Handler pattern**: Functions return `undefined` when they can't handle input, allowing fall-through to next handler
- **Scope tracking**: Uses 5 Maps + 2 Sets passed through all calls:
  - `scope`: variable name → value
  - `typeMap`: variable/type name → type size (or negative markers: -2 for functions, -4 for arrays)
  - `mutMap`: variable name → is mutable
  - `visMap`: variable name → is public (`out` keyword)
  - `uninitializedSet`: uninitialized variables
  - `unmutUninitializedSet`: uninitialized immutable variables

### Handler Organization

- **Expressions**: [src/expressions/](../src/expressions/) - binary/unary operations, grouped expressions
- **Handlers**: [src/handlers/](../src/handlers/) - specialized constructs (lambdas, method calls, etc.)
- **Types**: [src/types/](../src/types/) - struct/module/namespace/type declarations
- **Loops**: [src/loops/](../src/loops/) - for/while/loop constructs
- Handlers in `app.ts` are tried in sequence; first to return non-undefined wins

## Critical Code Constraints

### Enforced by ESLint (exits with error)

```javascript
// NO regex - use string parsing instead
"no-restricted-syntax": ["error", { selector: "Literal[regex]" }]

// NO null - use undefined
{ selector: "Literal[value=null]", message: "use undefined" }

// Max 200 lines per file (excluding comments/blanks)
"max-lines": ["error", { max: 200, skipComments: true }]
```

### Enforced by Custom Tools

```bash
# Max 8 TypeScript files per directory
bun run check:structure  # tools/check-dir-structure.ts

# No circular dependencies between src/ subdirectories
bun run check:subdir-deps  # tools/check-subdir-deps.ts
```

When violating file limits, refactor into subdirectories grouped by feature.

## Testing Patterns

Use Bun test framework. All tests follow this pattern:

```typescript
import { interpret } from "../../src/utils/interpret";

expect(interpret("let x = 5; x + 3")).toBe(8);
```

The `interpret()` function returns the final numeric value. Test files in [tests/](../tests/) mirror [src/](../src/) structure.

## Type System Specifics

### Type Annotations

- Unsigned types: `U8`, `U16`, `U32`, `U64` (validated at parse time)
- Signed types: `I8`, `I16`, `I32`, `I64`
- Others: `Bool` (1 bit), `Char` (8 bit)
- Function types: `(I32, I32) => I32` or `() => Bool`
- Array types: `[I32; 3; 5]` means 3 initialized elements, capacity 5

### Type Checking

- Type aliases: `type MyInt = I32;` stored in `typeMap` as `__alias__MyInt`
- Union types: `type Result = I32 | Bool;` stored as `__union__Result`
- Runtime check: `value is TypeName` operator

### Visibility

The `out` keyword makes declarations public (stored in `visMap`):

```typescript
out let x = 5;  // public variable
out fn main() => 0;  // public function
```

## Key Development Workflows

### Run Tests

```bash
bun test                    # All tests
bun test tests/core/        # Specific directory
```

### Linting & Formatting

```bash
bun run lint                # TypeScript + ESLint check
bun run lint:fix            # Auto-fix issues
bun run format              # Prettier
```

### Structure Validation

```bash
bun run check:structure     # Verify ≤8 files per dir
bun run check:subdir-deps   # Check circular subdirectory deps
bun run check:circular      # Check all circular deps (madge)
```

### Code Quality Tools

```bash
bun run cpd                 # Copy-paste detection (PMD)
bun run visualize           # Generate dependency graph
```

## Common Patterns

### Adding New Language Features

1. Create handler function that returns `number | undefined`
2. Add to `interpretWithScope()` call sequence in [src/app.ts](../src/app.ts)
3. If declaration: use `makeDeclarationHandler()` from [src/declarations.ts](../src/declarations.ts)
4. Add tests in [tests/](../tests/) following existing structure

### Parsing Without Regex

Use character-by-character traversal with helper functions:

- `scanNumericPrefix()` in [src/parser.ts](../src/parser.ts)
- `findEqualIndex()`, `findColonInBeforeEq()` in [src/utils/scope-helpers.ts](../src/utils/scope-helpers.ts)
- Track parentheses/brackets with counters, not regex matching

### Function Storage

- Function definitions: global `functionDefs` Map (name → definition)
- Function references: `setFunctionRef()` for variable-to-function binding
- Lambda expressions: auto-generated unique names stored in `typeMap` with `-2` marker

### Module System

Modules are namespaces with isolated scopes:

```typescript
module Math { out fn add(a: I32, b: I32) => a + b }
Math::add(3, 4)  // Access with ::
```

Global `modules` Map in [src/types/modules.ts](../src/types/modules.ts) stores per-module scope/typeMap/mutMap/visMap.

## Troubleshooting

- **"invalid expression"**: Parser couldn't handle; check `parseTypedNumber()` and grouped-expression handlers
- **"variable already declared"**: Scope collision; variables are function-scoped
- **"uninitialized variable"**: Accessing `let x: I32; x` before assignment
- **ESLint regex error**: Use string methods (`.indexOf()`, `.slice()`, `.includes()`) instead
- **Max lines error**: Split file into subdirectory with focused modules
