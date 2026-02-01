# AGENTS.md - Instructions for AI Coding Agents

## Quick Reference

**Project:** Tuff - TypeScript numeric interpreter with variable declarations and type coercion  
**Location:** `C:\Users\mathm\Documents\Projects\Tuff`  
**Node:** ^16.0.0 | **TypeScript:** ^5.9.3 | **Test Framework:** Jest

## Build & Test Commands

### Core Commands
- **Test all:** `npm test` - Run all 57 tests
- **Test single file:** `npm test -- tests/index.test.ts`
- **Test watch:** `npm run test:watch` - Auto-rerun on changes
- **Test coverage:** `npm run test:coverage` - Generate coverage report
- **Build:** `npm run build` - Compile TypeScript to `dist/`
- **Lint:** `npm run lint` - Check code with ESLint
- **Lint fix:** `npm run lint:fix` - Auto-fix formatting
- **Pre-commit:** `npm run precommit` - Full check suite (tests + lint + PMD)

### Quick Test by Name
```bash
npm test -- --testNamePattern="should allow widening from U8 to U16"
```

### Useful Flags
- `--verbose` - Show detailed test output
- `--no-coverage` - Skip coverage calculation

## Code Style Guidelines

### Imports & Modules
- Use ES6: `import { } from ""; export`
- Order: 1) Node built-ins, 2) External packages, 3) Internal modules
- **NO template strings** - Use string concatenation instead (PMD CPD limitation)
- Prefer named exports; default export only for main entry points
- Avoid `import * as X` for defaults—use `import X` instead

### Type System (Strict Mode)
- **Never use `any`** - Use specific types or `unknown` with type guards
- Use `interface` for extensible shapes, `type` for unions/discriminated unions
- Leverage type inference when obvious
- Use `readonly` for immutable properties
- Always type function parameters explicitly
- **Discriminated unions for error handling:** `type Result<T, E> = { success: true; data: T } | { success: false; error: E }`

### Naming Conventions
- **Variables/functions:** `camelCase` (e.g., `interpretAddSubtract`, `createScope`)
- **Types/interfaces:** `PascalCase` (e.g., `Variable`, `VariableScope`)
- **Constants:** `UPPER_SNAKE_CASE` (e.g., `TYPE_RANGES`, `TYPE_ORDER`)
- **Private members:** Leading underscore (e.g., `_internalState`)
- **Files:** `kebab-case` or `camelCase` (e.g., `index.ts`)

### Formatting (ESLint Enforced)
- **Indentation:** 2 spaces (tabs forbidden)
- **Quotes:** Double quotes ONLY (ESLint enforces)
- **Semicolons:** Always required
- **Equality:** Use `===` and `!==` exclusively
- **Line length:** Soft limit 100 chars
- **Unused variables:** Prefix with `_` to suppress warning (e.g., `_unused`)
- **Function size:** Max 50 lines (blank lines & comments excluded)

### Functions & Composition
- Keep functions focused (single responsibility)
- Prefer pure functions (no side effects)
- Extract long functions into helpers (strict 50-line limit)
- Use default parameters: `function foo(x: number = 5) {}`
- Arrow functions for callbacks; regular functions for methods/utils

### Error Handling
- Use `Result<T, E>` discriminated union type consistently
- Check `result.success` before accessing `data` or `error`
- Type-safe casting: `(result as { success: true; data: T }).data`
- Never suppress type errors; always handle both branches
- Prefix error messages with context (e.g., "Undefined variable: x")

## Project-Specific Guidelines

### Tuff Interpreter Architecture
- **Entry point:** `export function interpret(input: string, scope?: VariableScope): Result<number | bigint, string>`
- **Scope chain:** Parent reference enables nested variable lookups
- **Type hierarchy:** `TYPE_RANGES` defines bounds; `TYPE_ORDER` determines coercion validity
- **Statement blocks:** Separated by `;` at depth 0 (respecting brace/paren nesting)

### Variable Declaration Syntax
```typescript
// Explicit type
let x : U8 = 5;

// Type inference from literal
let x = 100U8;  // Infers U8

// Type coercion (widening only)
let x = 100U8;
let y : U16 = x;  // ✅ Valid (U8 → U16)
let z : U8 = y;   // ❌ Error (U16 → U8 is narrowing)
```

### Testing Requirements
- Tests in `tests/index.test.ts` with Jest syntax
- Each describe block ≤ 50 lines (ESLint enforces)
- Use helper functions: `expectValid(input, expected)` and `expectInvalid(input)`
- Test all code paths: valid inputs, overflow, narrowing, undefined vars, etc.
- Currently: 57 tests covering types, arithmetic, variables, and coercion

## Git Workflow

- **Conventional commits:** `feat:`, `fix:`, `refactor:`, `test:`, `docs:`
- **Example:** `feat: implement type coercion in variable declarations`
- **Pre-commit runs:** tests, ESLint, PMD duplicate code (50-token threshold)
- **Only commit when:** Explicitly requested or feature complete
- **Always run:** `npm run precommit` before git push to verify all checks pass

## Common Patterns

### Result Type Usage
```typescript
function example(): Result<number, string> {
  if (error) {
    return { success: false, error: "Description" };
  }
  return { success: true, data: value };
}

// Caller
const result = example();
if (!result.success) {
  console.error(result.error);
  return result;
}
const data = (result as { success: true; data: number }).data;
```

### Recursive Interpretation
- `interpret(input, scope)` → calls `interpretAddSubtract` → `interpretMultiplyDivide` → `performOperation`
- **Scope threading:** Pass `scope` parameter through ALL recursive calls
- **Variable lookup:** Use `lookupVariable(scope, name)` which walks parent chain

### Type Coercion
- `canCoerceType(sourceType, targetType)` - Check if widening is valid
- Uses `TYPE_ORDER` index comparison and `TYPE_RANGES` signedness matching
- Narrowing (smaller index → larger) returns error

## Pre-Commit Checks

All checks must pass before commit:

1. **Test Suite:** `npm test` → 57 tests passing
2. **ESLint:** Max 50 lines/function, no templates, double quotes only
3. **PMD:** Minimum 50 tokens for duplication detection (structural patterns OK)

Run manually: `npm run precommit`

## Debugging Tips

### Print Type Information
```typescript
console.log("Type:", getTypeForValue("100U8"));  // "U8"
console.log("Order index:", TYPE_ORDER.indexOf("U16"));  // 1
```

### Trace Variable Lookups
```typescript
const result = lookupVariable(scope, varName);
if (result.success) {
  console.log("Found:", result.data);
} else {
  console.log("Not found:", result.error);
}
```

### Test Single Scenario
```bash
npm test -- --testNamePattern="should allow widening from U8 to U16"
```

---

**Last Updated:** February 2025  
**Test Coverage:** 57 tests passing | ESLint: ✅ | PMD: ✅
