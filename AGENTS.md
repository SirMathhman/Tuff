# AGENTS.md - AI Coding Agent Instructions

**Project:** Tuff - TypeScript numeric interpreter with typed variables and arithmetic  
**Stack:** Node ^16 | TypeScript ^5.9.3 | Jest | ESLint | Husky (pre-commit hooks)  
**Tests:** 57 | **Status:** ✅ Strict mode + full coverage

## Commands: Build, Test, Lint

```bash
npm test                              # Run all 57 tests
npm test -- --testNamePattern="foo"  # Run tests matching pattern
npm test -- tests/index.test.ts      # Run single test file
npm run test:watch                   # Watch mode
npm run test:coverage                # Coverage report → coverage/
npm run build                        # TypeScript → dist/
npm run lint                         # ESLint check
npm run lint:fix                     # Auto-fix ESLint violations
npm run precommit                    # Full suite: tests + lint + PMD (REQUIRED before push)
```

**Run single test:** `npm test -- --testNamePattern="should interpret a simple number"`

## Code Style & Conventions

### Imports & Modules
- **ES6 only:** `import { foo } from "module"; export`
- **Order:** Node built-ins → external packages → internal modules
- **NO template literals** (causes PMD CPD false positives—use concatenation)
- Named exports preferred; default only for entry point

### Types (Strict Mode Enabled)
- Never use `any`; prefer specific types or `unknown` with guards
- `interface` for extensible shapes; `type` for unions/discriminated unions
- Always type function parameters explicitly
- **Error pattern:** `type Result<T, E> = { success: true; data: T } | { success: false; error: E }`
- Prefix errors with context: `"Undefined variable: x"` (not just `"Error"`)

### Naming
- **camelCase:** variables, functions (`interpretAddSubtract`, `createScope`)
- **PascalCase:** types, interfaces (`Variable`, `VariableScope`)
- **UPPER_SNAKE_CASE:** constants (`TYPE_RANGES`, `TYPE_ORDER`)
- **_prefix:** private members (`_internalCache`)

### Formatting (ESLint)
- **2 spaces** indentation (never tabs)
- **Double quotes** always (never single)
- **Semicolons** required
- **`===` and `!==`** only (never `==`, `!=`)
- **Max 50 lines per function** (blank lines & comments don't count)
- **Max 500 lines per file** (warning threshold)
- **Unused vars:** prefix with `_` to suppress lint warning

### Error Handling Pattern
```typescript
function example(): Result<number, string> {
  if (error) return { success: false, error: "Context: description" };
  return { success: true, data: value };
}

const result = example();
if (!result.success) return result;
const data = (result as { success: true; data: number }).data;
```

## Tuff Interpreter Architecture

**Entry point:** `interpret(input: string, scope?: VariableScope): Result<number | bigint, string>`

**Flow:** Parser → Executor → Expressions (recursive descent) → Result  
**Key files:** `parser.ts`, `executor.ts`, `expressions.ts`, `types.ts`, `core.ts`

### Type System
- **TYPE_RANGES:** min/max bounds for Bool, U8, U16, U32, U64, I8, I16, I32, I64
- **TYPE_ORDER:** index-based ordering for widening validation
- **Coercion rule:** only widen (lower index → higher); narrowing always errors
- **Pointer types:** `*T` (immutable), `*mut T` (mutable), `getPointeeType()`, `pointerDepth()`
- **Array types:** `[T; initialized; total]`, `parseArrayType()`, `updateArrayInitializedCount()`

### Variable Declarations
```typescript
let x : U8 = 5;          // explicit type
let x = 100U8;           // type inference from suffix
let y : U16 = x;         // ✅ valid widening (U8 → U16)
let z : U8 = y;          // ❌ error: narrowing forbidden
```

### Scope Chain
Variables stored in linked `VariableScope` with `variables: Map`, `functions: Map`, `parent: VariableScope | null`.  
**Critical:** Pass `scope` through ALL recursive calls for proper variable resolution.

## Testing

**Location:** `tests/index.test.ts` (Jest)  
**Helpers:** `expectValid(input, expected)`, `expectInvalid(input)`  
**Max 50 lines per describe block** (ESLint enforces)  
**Coverage:** valid inputs, overflow, narrowing errors, undefined vars, edge cases

## Common Patterns & Examples

### Result Type Usage
```typescript
const result = interpret("let x = 5; x");
if (!result.success) return result;  // early exit with error
const value = (result as { success: true; data: number }).data;
```

### Recursive Expression Parsing
Flow: `interpretAddSubtract()` → `interpretMultiplyDivide()` → `interpretAtom()`  
**Always pass `scope` to recursive calls** for variable resolution.

### Type Coercion
- Only widening allowed: lower TYPE_ORDER index → higher index
- Example: Bool (0) → U8 (1) → U16 (2) ✅ valid
- Example: U16 (2) → U8 (1) ❌ always errors
- Use `canCoerceType(sourceType, targetType)` for validation

## Debugging & Troubleshooting

- **Failed tests?** Run `npm run lint:fix && npm test` to auto-fix + retest
- **ESLint violations?** Check `.eslintrc.json` rules; run `npm run lint --fix`
- **Type errors?** Review `.strict: true` in `tsconfig.json`; never use `any`
- **PMD failures?** Remove template literals (backticks); use string concatenation
- **Scope issues?** Ensure `scope` parameter flows through all function calls

## Git Workflow

- **Commit format:** `feat:`, `fix:`, `refactor:`, `test:`, `docs:` (conventional commits)
- **Example:** `feat: add pointer type support` or `fix: narrow type validation`
- **Before push:** `npm run precommit` must pass completely
- **Only commit when** explicitly requested or feature is complete
- **Pre-commit hooks:** `.husky/pre-commit` runs the `precommit` script

---

**See `.github/copilot-instructions.md` for extended architecture details.**  
**Status:** ✅ Verified | **Last Updated:** February 2025
