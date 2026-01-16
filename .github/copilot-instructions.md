# Copilot Instructions for Tuff

## Project Overview

**Tuff** is a TypeScript-based expression interpreter that parses and evaluates mathematical expressions with typed numeric literals.

### Core Architecture

- **Single responsibility**: `interpret()` function serves as the main API in [src/interpret.ts](../src/interpret.ts)
- **Error handling**: Uses a custom `Result<T>` discriminated union type ([src/result.ts](../src/result.ts)) for explicit error propagation (no exceptions)
- **Parsing pipeline**: Split into focused functions—type suffix detection → literal parsing → operator detection → binary operation evaluation

### Key Data Structures

```typescript
// Result type - mandatory for all fallible operations
Result<T> = { type: 'ok'; value: T } | { type: 'err'; error: string }
```

**Why this pattern**: Enables exhaustive type checking and forces error handling at call sites. Always use `if (result.type === 'err')` checks.

## Development Workflows

### Testing

- **Run**: `pnpm test` or `pnpm test:watch`
- **Coverage**: `pnpm test:coverage`
- **Location**: Tests in `tests/*.test.ts` use Jest with `ts-jest`
- **Pattern**: Test structure with exhaustive type checks:
  ```typescript
  if (result.type === 'ok') {
    expect(result.value).toBe(expected);
  }
  ```

### Code Quality

- **Linting**: `pnpm lint` (strict ESLint + TypeScript rules)
- **Fix**: `pnpm lint:fix` (includes Prettier formatting)
- **Duplicate detection**: `pnpm cpd` (PMD Copy-Paste Detector with 50-token minimum)
- **Pre-commit**: Husky hook runs `test && lint:fix && cpd` automatically

## Critical Patterns & Conventions

### 1. **Operator Detection with Whitespace Handling**

`findOperator()` scans for `+`, `-`, `*`, `/` but must skip whitespace when checking context. This is essential for expressions like `"1U8 + 2"` where the operator may have leading spaces.

**Pattern**: Look backward from candidate position, skip spaces, then verify previous character is alphanumeric.

### 2. **Type Suffix Parsing (U8, I8, etc.)**

- Type suffixes appear **immediately after digits** (e.g., `100U8`, `42I8`)
- Detection: Scan backward from string end, stop at first non-digit, check if preceded by 'U' or 'I'
- Validation happens in `validateValueForType()` — currently enforces `U8: [0, 255]` range
- **Future expansion**: Add more types here without changing core parsing logic

### 3. **Error Propagation Pattern**

All parsing functions return `Result<number>`. Follow this pattern when adding features:

```typescript
const leftResult = parseLiteral(leftStr);
if (leftResult.type === 'err') {
  return leftResult; // Bubble error up
}
```

### 4. **Expression Evaluation Flow**

1. Parse left operand (includes type suffix validation)
2. Find operator (with whitespace tolerance)
3. Parse right operand
4. Execute binary operation only if both operands parse successfully

**Why this order**: Ensures left-to-right validation and clear error attribution.

## Code Style & Linting Rules

### Naming Conventions

- **Variables/functions**: `camelCase`
- **Constants**: `UPPER_CASE`
- **Types**: `PascalCase`

### Strictness Enforcements

- **No `any` types** (`@typescript-eslint/no-explicit-any: 'error'`)
- **No non-null assertions** (`@typescript-eslint/no-non-null-assertion: 'error'`)
- **Strict booleans** (`@typescript-eslint/strict-boolean-expressions: 'error'`)
- **Max nesting depth: 2** (`max-depth: 2`) — keep functions small and focused
- **No console** except warnings/errors (`no-console: ['error', { allow: ['warn', 'error'] }]`)
- **Prefer const + optional chaining** — variables must not be reassigned
- **Template literals** — no string concatenation (`prefer-template: 'error'`)

### ESLint Configuration

Flat config in [eslint.config.js](../eslint.config.js) with separate rules for test files (slightly relaxed). TypeScript-ESLint integration via `@typescript-eslint/parser` with `tsconfig.json` project reference.

## Integration Points & Dependencies

### External Dependencies (DevDeps Only)

- **TypeScript 5.3+**: Strict type checking
- **Jest 29.7 + ts-jest**: Test runner with TypeScript support
- **ESLint 8.56 + Prettier 3.1**: Linting and formatting
- **Husky 9.1**: Git hook automation
- **PMD 7.x**: Copy-paste detection (`pnpm cpd`)

### File Organization

```
src/
  interpret.ts      # Main parser + evaluator (single export)
  result.ts         # Result type + helpers
tests/
  interpret.test.ts # All test cases, directly import from src/
```

**Convention**: All internal helper functions in `interpret.ts` are unexported. Only `interpret()` is the public API.

## Adding New Features

### Example: Adding a new operator or type

1. Update `findOperator()` if needed for tokenization
2. Add type validation in `validateValueForType()` for new types
3. Add operation branch in `evaluateBinaryOp()`
4. Write test cases covering success + edge cases
5. Run `pnpm lint:fix && pnpm test` before committing

### Example: Modifying error messages

All errors use `err()` helper from `result.ts`. Ensure error messages are user-friendly and include context (e.g., `"Value 256 is out of range for U8 (0-255)"`).

## Testing Checklist

Before marking features complete:

- [ ] Test with both typed (`100U8`) and untyped (`100`) literals
- [ ] Test mixed operands: `1U8 + 2`, `1 + 2U8`
- [ ] Test error cases: out-of-range values, division by zero, invalid syntax
- [ ] No console warnings/errors in test output
- [ ] `pnpm lint` passes with no errors
- [ ] `pnpm cpd` detects no duplicates

---

**Last Updated**: January 2026 | **Project Version**: 1.0.0
