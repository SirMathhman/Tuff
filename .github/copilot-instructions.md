# Copilot Instructions for Tuff

## Project Overview

**Tuff** is a TypeScript-based expression interpreter that evaluates typed mathematical expressions with variable bindings, logical operators, and block scoping.

### Core Architecture (3-Module Design)

1. **[src/result.ts](../src/result.ts)**: Result type for error handling (mandatory for all fallible operations)
2. **[src/types.ts](../src/types.ts)**: All type interfaces and utility functions (447 lines of validation, parsing helpers, and state management)
3. **[src/interpret.ts](../src/interpret.ts)**: Main interpreter with variable binding processing and expression evaluation (584 lines, ≤500 code lines after blank/comment skipping)

**Entry point**: `interpret(input: string): Result<number>` - processes variable declarations/assignments, then evaluates remaining expression.

### Key Error Handling Pattern

```typescript
// All operations return Result<T> - exhaustive checking mandatory
Result<T> = { type: 'ok'; value: T } | { type: 'err'; error: string }
if (result.type === 'err') { return result; } // Bubble errors immediately
```

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

## Language Features & Evaluation Order

### Supported Syntax

- **Typed literals**: `100U8`, `42I16` (types: U8, U16, U32, I8, I16, I32)
- **Boolean literals**: `true` (→ 1), `false` (→ 0), with `Bool` type annotation
- **Operators** (by precedence, lowest first):
  - `||` (logical OR, precedence 0) — `left !== 0 || right !== 0`
  - `&&` (logical AND, precedence 1) — `left !== 0 && right !== 0`
  - `+`, `-` (precedence 2)
  - `*`, `/` (precedence 3, floor division)
- **Variable bindings**: `let x = 5; x + 3` or `let mut x = 0; x = 10; x`
- **Block scoping**: `{ let y = 100; y }` (new variables isolated, outer mutations allowed)
- **Type annotations**: `let x : I32 = 7;` with range validation
- **Uninitialized declarations**: `let x : I32;` (then `x = 2;` to assign)

### Critical Parsing Patterns

**1. Boolean Literal Detection (before variable lookup)**
- In `parseLiteral()`, check `trimmed === 'true'` and `trimmed === 'false'` **before** calling `isVariableName()`
- This prevents shadowing `true`/`false` with variable names

**2. Type Suffix Parsing (U8, I8, etc.)**
- Suffixes appear immediately after digits: `100U8`, `42I8`
- `findTypeSuffixStart()` scans backward from string end, stops at first non-digit
- Validation in `validateValueForType()` enforces ranges (e.g., U8: [0, 255])

**3. Operator Precedence Resolution in `findOperator()`**
- Scans expression for lowest-precedence operator (stops at bracket depth 0)
- Two-character operators (`||`, `&&`) checked before single-char via `checkTwoCharOperator()`
- Returns `OperatorMatch` with operator, index, and precedence level

**4. Block Scoping in `processBracedBlock()`**
- Uses `.map()` to propagate only mutations of existing outer-scope variables
- New variables declared in blocks don't leak: `{ let x = 7; } x => Error`
- But mutations of mutable variables propagate: `let mut x = 0; { x = 100; } x => 100`

**5. Statement vs Expression Blocks**
- `containsStatements()` detects blocks with `let` or assignment statements
- `shouldProcessAsStatementBlock()` ensures block has content after closing brace
- Expression blocks: `{ let x = 7; x }` → value is inner expression result
- Statement blocks: `{ let x = 7; } expr` → process bindings, then evaluate expr

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
- **Max function lines: 50** (`max-lines-per-function: 50`)
- **Max file lines: 500** (`max-lines: 500` with `skipBlankLines: true, skipComments: true`)
- **No ternary operators** (`no-ternary: 'error'`)
- **No console** except warnings/errors (`no-console: ['error', { allow: ['warn', 'error'] }]`)
- **Prefer const + optional chaining** — variables must not be reassigned
- **Template literals** — no string concatenation (`prefer-template: 'error'`)
- **No anonymous object types** — must define named interfaces (prevents accidental duplicates)

### ESLint Configuration

Flat config in [eslint.config.js](../eslint.config.js) with separate rules for test files (slightly relaxed). TypeScript-ESLint integration via `@typescript-eslint/parser` with `tsconfig.json` project reference.

### Recent Refactoring: Module Split

The interpreter was refactored to separate concerns:
- **Before**: Single `interpret.ts` file (717+ lines) - violated max-lines rule
- **After**: Split into 3 modules:
  - `types.ts` (447 lines): Type definitions, validation, operator helpers
  - `interpret.ts` (584 lines, ~496 code lines): Parser and evaluator
  - `result.ts` (minimal): Result type and constructors
- **Benefit**: Enables feature addition without line-count pressure; clearer module boundaries
- **Pattern**: Extract utility functions to `types.ts` when `interpret.ts` approaches 500-line limit

### Code Deduplication Strategy

The `processStatements()` function eliminated duplicate code between:
- `interpret()` - top-level statement processing with block support
- `processVariableBindings()` - nested binding processing without blocks

**Pattern**: Created `processStatements(input, context, allowBlocks: boolean)` to unify logic, reducing duplication while maintaining clear responsibility separation.

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

### Example: Adding a new binary operator

1. Add operator string to `operators` list in `findOperator()` (line 443)
2. Add precedence via `checkSingleCharOperator()` or `checkTwoCharOperator()` in [src/types.ts](../src/types.ts)
3. Add evaluation case in `evaluateBinaryOp()` in [src/interpret.ts](../src/interpret.ts)
4. Add test cases covering:
   - Basic operation: `"2 + 3" => 5`
   - Precedence interactions: `"1 + 2 * 3" => 7`
   - Error cases (e.g., division by zero)
5. Run `pnpm test && pnpm lint:fix && pnpm cpd` before commit

### Example: Adding a new type

1. Add type name to `validateValueForType()` switch in [src/types.ts](../src/types.ts)
2. Add range constraints via `getTypeRangeMax()` and `getTypeRangeMin()`
3. Update `collectTypeSuffixes()` if precedence rules needed for type coercion
4. Add test cases with both valid and out-of-range values

### Module Organization

- **types.ts**: All type definitions, validation functions, operator helpers (no side effects)
- **interpret.ts**: Main interpreter logic, statement processing, expression evaluation
- **result.ts**: Result type and helpers (never changes)

**Key constraint**: `interpret.ts` ≤ 500 lines (skipBlankLines/skipComments). Keep tight by extracting logic to `types.ts`.

## Testing Checklist

Before marking features complete:

- [ ] Test with both typed (`100U8`) and untyped (`100`) literals
- [ ] Test mixed operands: `1U8 + 2`, `1 + 2U8`
- [ ] Test error cases: out-of-range values, division by zero, invalid syntax
- [ ] Test variable declarations: `let x = 5; x`, `let mut x = 0; x = 100; x`
- [ ] Test block scoping: `{ let x = 7; } x => Error`, `let mut x = 0; { x = 100; } x => 100`
- [ ] Test logical operators: `true || false => 1`, `false && false => 0`
- [ ] Test operator precedence: `1 + 2 * 3 => 7`, `true || false && false => 1`
- [ ] No console warnings/errors in test output
- [ ] `pnpm lint` passes with no errors
- [ ] `pnpm cpd` detects no duplicates (50-token minimum)
- [ ] `pnpm test` shows all tests passing

---

**Last Updated**: January 16, 2026 | **Project Version**: 1.0.0 | **Test Coverage**: 57 tests
