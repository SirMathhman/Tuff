# AGENTS.md - Instructions for AI Coding Agents

## Quick Reference

**Project:** Tuff - TypeScript numeric interpreter with variable declarations and type coercion  
**Location:** `C:\Users\mathm\Documents\Projects\Tuff`  
**Node:** ^16.0.0 | **TypeScript:** ^5.9.3 | **Test Framework:** Jest  
**Test Count:** 57 tests | **ESLint:** ✅ | **Strict Mode:** ✅

## Build & Test Commands

### Core Commands
```bash
npm test                          # Run all 57 tests
npm test -- tests/index.test.ts  # Run single test file
npm test -- --testNamePattern="pattern"  # Run tests by name
npm run test:watch               # Auto-rerun on changes
npm run test:coverage            # Generate coverage report
npm run build                    # Compile TypeScript to dist/
npm run lint                     # Check code with ESLint
npm run lint:fix                 # Auto-fix formatting issues
npm run precommit                # Full check suite (tests + lint + PMD)
```

**Important:** Always run `npm run precommit` before pushing—it runs tests, ESLint, and PMD duplicate code detection (50-token threshold).

## Code Style Guidelines

### Imports & Modules
- **ES6 only:** `import { } from ""; export`
- **Order:** 1) Node built-ins, 2) External packages, 3) Internal modules
- **NO template strings** - Use string concatenation (PMD CPD limitation)
- Prefer named exports; default export only for main entry points
- Use `import X` instead of `import * as X` for defaults

### Type System (Strict Mode Enforced)
- **Never use `any`** - Use specific types or `unknown` with type guards
- `interface` for extensible shapes; `type` for unions/discriminated unions
- Type function parameters explicitly
- Use `readonly` for immutable properties
- **Discriminated unions for errors:** `type Result<T, E> = { success: true; data: T } | { success: false; error: E }`
- Leverage type inference when obvious

### Naming Conventions
- **Variables/functions:** `camelCase` (e.g., `interpretAddSubtract`, `createScope`)
- **Types/interfaces:** `PascalCase` (e.g., `Variable`, `VariableScope`)
- **Constants:** `UPPER_SNAKE_CASE` (e.g., `TYPE_RANGES`, `TYPE_ORDER`)
- **Private members:** Leading underscore (e.g., `_internalState`)
- **Files:** `kebab-case` or `camelCase`

### Formatting (ESLint Enforced)
- **Indentation:** 2 spaces (tabs forbidden)
- **Quotes:** Double quotes ONLY
- **Semicolons:** Always required
- **Equality:** Use `===` and `!==` exclusively
- **Line length:** Soft limit 100 chars
- **Unused variables:** Prefix with `_` to suppress warning
- **Function size:** Max 50 lines (blank lines & comments excluded)
- **File size:** Max 500 lines (warn at threshold)

### Functions & Composition
- Single responsibility principle (one job per function)
- Pure functions preferred (no side effects)
- Default parameters: `function foo(x: number = 5) {}`
- Arrow functions for callbacks; regular functions for utils/methods
- Extract long logic into helpers (enforce 50-line limit)

### Error Handling
- Use `Result<T, E>` discriminated union consistently
- Always check `result.success` before accessing `data` or `error`
- Never suppress TypeErrors; handle both branches
- Prefix error messages with context: `"Undefined variable: x"`
- Type-safe casting: `(result as { success: true; data: T }).data`

## Project-Specific Guidelines

### Tuff Interpreter Architecture
- **Entry:** `export function interpret(input: string, scope?: VariableScope): Result<number | bigint, string>`
- **Scope chain:** Parent reference enables nested variable lookups
- **Type hierarchy:** `TYPE_RANGES` defines bounds; `TYPE_ORDER` determines coercion validity
- **Statement blocks:** Separated by `;` at depth 0 (respecting brace/paren nesting)

### Variable Declaration Syntax
```typescript
let x : U8 = 5;              // Explicit type
let x = 100U8;               // Type inference from literal
let y : U16 = x;             // ✅ Valid (U8 → U16 widening)
let z : U8 = y;              // ❌ Error (U16 → U8 narrowing)
```

### Type Coercion
- `canCoerceType(sourceType, targetType)` checks widening validity
- Uses `TYPE_ORDER` index comparison and `TYPE_RANGES` signedness matching
- Narrowing (smaller index → larger) always errors

### Testing Requirements
- Tests in `tests/index.test.ts` with Jest syntax
- Each describe block ≤ 50 lines (ESLint enforces)
- Helper functions: `expectValid(input, expected)`, `expectInvalid(input)`
- Test all paths: valid inputs, overflow, narrowing, undefined vars, etc.

## Common Patterns

### Result Type Usage
```typescript
function example(): Result<number, string> {
  if (error) return { success: false, error: "Description" };
  return { success: true, data: value };
}

const result = example();
if (!result.success) {
  console.error(result.error);
  return result;
}
const data = (result as { success: true; data: number }).data;
```

### Recursive Interpretation Flow
`interpret(input, scope)` → `interpretAddSubtract` → `interpretMultiplyDivide` → `performOperation`

**Critical:** Pass `scope` parameter through ALL recursive calls for proper variable scoping.

## Git & Pre-Commit Workflow

- **Conventional commits:** `feat:`, `fix:`, `refactor:`, `test:`, `docs:`
- **Example:** `feat: implement type coercion in variable declarations`
- **Pre-commit runs:** tests (57), ESLint, PMD duplicate detection
- **Only commit when:** Explicitly requested or feature complete
- **Verify before push:** `npm run precommit` (all checks must pass)

---

**Last Updated:** February 2025 | **Coverage:** 57 tests | **Status:** ✅ Verified
