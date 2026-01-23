# Tuff

A strongly-typed expression evaluator with support for variables, arithmetic operations, boolean logic, and if-else conditional expressions.

## Features

### Core Language Features

- **Type-suffixed numeric literals**: `100U8`, `255U16`, `-50I32`, etc.
- **Arithmetic operations**: `+`, `-`, `*`, `/` with overflow checking
- **Boolean operations**: `&&` (AND), `||` (OR)
- **Variable declarations**: `let x : U8 = 100U8;` with type inference
- **Mutable variables**: `let mut x = 0; x = 1;`
- **If-else expressions**: `if (true || false) 3 else 5`
- **Nested expressions**: Supports parentheses `()` and curly braces `{}`

### If-Else Conditional Expressions

```typescript
// Basic if-else
let result = if (true) 10 else 20; // result = 10

// With boolean operators
let x = if (true || false) 3 else 5; // x = 3

// With variables
let cond = true;
let value = if (cond) 100 else 200; // value = 100

// Nested if-else
let nested = if (true) if (false) 1 else 2 else 3; // nested = 2
```

## Quality Checks

This project maintains strict code quality standards enforced by pre-commit hooks:

- **Tests**: 100% pass rate required (57/57 tests currently passing)
- **Test Coverage**: ~93% function coverage, ~93% line coverage
- **Linting**: 
  - Max 50 lines per function
  - Max 200 lines per file
  - No regex literals (use string methods)
  - No `null` (use `undefined`)
- **Formatting**: Prettier enforced
- **Circular Dependencies**: 
  - File-level check via `madge`
  - Subdirectory-level check via custom tool
- **Directory Structure**: Max 8 TypeScript files per directory
- **Code Duplication**: 
  - AST-based duplication check (min 15 nodes)
  - Token-based duplication check (min 50 tokens via PMD CPD)

### Subdirectory Dependency Validation

The project includes a custom tool (`tools/check-subdir-deps.ts`) that ensures subdirectories in `src/` don't have circular dependencies at the architectural level:

```
src/
├── core/     (foundation layer)
├── parse/    (parsing layer)
├── eval/     (evaluation layer)
└── utils/    (utility layer)
```

Valid dependency flow: `core` ← `parse` ← `eval`, with `utils` providing utilities to all layers.

## Running Quality Checks

```bash
# Run all tests with coverage
bun test --coverage

# Run linting
bun run lint:fix

# Check for circular dependencies (file-level)
bun run check:circular

# Check subdirectory dependencies
bun run check:subdir-deps

# Check directory structure
bun run check:structure

# Check for code duplication
bun run cpd
npm run dupfind
```

## Architecture

```
src/
├── core/               # Foundation types (Result, Error, Arithmetic)
│   ├── arithmetic.ts
│   ├── error.ts
│   └── result.ts
├── parse/              # Parsing layer
│   └── parser.ts
├── eval/               # Evaluation layer
│   ├── ifelse-helpers.ts
│   ├── ifelse.ts
│   ├── intepret-helpers.ts
│   ├── intepret.ts
│   └── variables.ts
└── utils/              # Cross-cutting utilities
    ├── types.ts
    └── validation.ts
```

## Development

```bash
# Install dependencies
bun install

# Run tests
bun test

# Commit changes (runs all pre-commit hooks)
git commit
```

All commits must pass:
1. Test suite (57 tests)
2. Linting (ESLint)
3. Formatting (Prettier)
4. Circular dependency checks (file + subdirectory level)
5. Directory structure validation
6. Code duplication checks (2 tools)
7. Dependency graph visualization

## Type System

- **Unsigned integers**: `U8`, `U16`, `U32`, `U64`, `U128`
- **Signed integers**: `I8`, `I16`, `I32`, `I64`, `I128`
- **Booleans**: `Bool`
- **Type compatibility**: Automatic widening (U8 → U16), no narrowing
- **Type inference**: Unsuffixed literals default to `I32`

## Example Usage

```typescript
import { evaluateExpression } from "./src/eval/intepret";

// Simple arithmetic
evaluateExpression("10 + 20", new Map()); // ok(30)

// If-else expressions
evaluateExpression("if (true) 100 else 200", new Map()); // ok(100)

// Variables with if-else
evaluateExpression("let x = if (false) 10 else 20; x", new Map()); // ok(20)

// Nested conditions
evaluateExpression("if (true || false) if (true) 1 else 2 else 3", new Map()); // ok(1)
```
