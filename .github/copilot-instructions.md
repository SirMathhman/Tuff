# Tuff - AI Coding Agent Instructions

## Project Overview

Tuff is a strongly-typed expression evaluator implementing a custom language with type-suffixed numeric literals, boolean logic, variables, and if-else expressions. **Critical**: This codebase enforces extreme quality standards via pre-commit hooks - all code must pass 8 validation steps before commit.

## Architecture: Layered Dependency Flow

```
core/ → parse/ → eval/
  ↑       ↑       ↑
  └───────┴───────┴─── utils/ (cross-cutting)
```

**NEVER** create circular dependencies between these subdirectories. The `check-subdir-deps` tool will reject commits that violate this. Valid patterns:
- ✅ `eval/` importing from `core/`, `parse/`, `utils/`
- ✅ `parse/` importing from `core/`, `utils/`
- ❌ `core/` importing from `eval/` or `parse/`
- ❌ `parse/` importing from `eval/`

## Critical Pattern: Result<T, E> Instead of Exceptions

**NEVER use `throw` statements** - ESLint will reject your code. Use `Result<T, E>` from `src/core/result.ts`:

```typescript
// ❌ BANNED
function divide(a: number, b: number): number {
  if (b === 0) throw new Error("Division by zero");
  return a / b;
}

// ✅ CORRECT
function divide(a: number, b: number): Result<number, TuffError> {
  if (b === 0) return err({ cause: "Division by zero", context: "...", reason: "...", fix: "..." });
  return ok(a / b);
}

// ✅ Pattern when consuming Result
const result = divide(10, 0);
if (!result.ok) return result;  // Propagate error
const value = result.value;     // Safe to access
```

## Code Quality Constraints (ENFORCED BY PRE-COMMIT)

Every commit must pass these checks - violations block the commit:

1. **Max 50 lines per function** (use helper extraction, not comments to bypass)
2. **Max 200 lines per file** (split into multiple files if exceeded)
3. **Max 8 TypeScript files per directory** (`tools/check-dir-structure.ts`)
4. **No regex literals** (`/pattern/`) - use `string.split().join()` or `indexOf()`
5. **No `null`** - always use `undefined`
6. **No circular dependencies** (file-level: `madge`, subdirectory-level: `tools/check-subdir-deps.ts`)
7. **No code duplication** (AST: `dupfind.exe` 15+ nodes, Token: PMD CPD 50+ tokens)
8. **All tests pass** (57/57 tests, ~93% coverage)

### Real Example: Avoiding Regex Ban

```typescript
// ❌ BANNED by ESLint
const normalized = filePath.replace(/\\/g, "/");

// ✅ CORRECT
const normalized = filePath.split("\\").join("/");
```

## Adding New Language Features

Follow this 4-layer pattern (see `src/eval/ifelse.ts` + `ifelse-helpers.ts` for reference):

1. **Parse layer** (`src/parse/`): Add token/syntax recognition if needed
2. **Eval helpers** (`src/eval/*-helpers.ts`): Extract complex logic into <50 line functions
3. **Main evaluator** (`src/eval/intepret.ts`): Route new syntax in `evaluateExpression()`
4. **Tests** (`tests/intepret.*.test.ts`): Cover success + error cases, use `isOk()` guard pattern

```typescript
// Example: Adding support for new expressions
export function evaluateExpression(expr: string, vars: Map<string, VariableEntry>): Result<number, TuffError> {
  const trimmed = expr.trim();
  
  // 1. Check for variable declarations first
  if (trimmed.startsWith("let ")) {
    const parsed = parseVariableDeclarations(trimmed, vars, evaluateExpression);
    if (!parsed.ok) return parsed;
    return evaluateExpression(parsed.value.finalExpr, parsed.value.vars);
  }
  
  // 2. Check for if-else before parentheses resolution
  if (trimmed.startsWith("if")) {
    return parseIfElseTopLevel(trimmed, vars, evaluateExpression);
  }
  
  // 3. Resolve parentheses/braces recursively
  // ... rest of evaluation
}
```

## Test Pattern: Guard-Based Result Checking

```typescript
it("evaluates expression", () => {
  const result = intepret("if (true) 10 else 20");
  expect(isOk(result)).toBe(true);  // Type guard
  if (isOk(result)) {                // TypeScript narrows type here
    expect(result.value).toBe(10);   // Now safe to access .value
  }
});
```

## Type System Rules (src/utils/types.ts)

- **Widening allowed**: `U8` → `U16` → `U32` → `U64` → `U128`
- **Narrowing banned**: `U16` cannot assign to `U8` (runtime error via `isTypeCompatible`)
- **Unsuffixed literals default to `I32`**
- **Type compatibility**: Use `isTypeCompatible(source, target)` before assignments

## Parameter Object Pattern (Duplication Avoidance)

When functions exceed line limits, extract parameter objects:

```typescript
// ❌ Too many parameters (5+)
function handleDeclaration(stmt: string, vars: Map<...>, evaluator?: (...) => Result<...>, ctx: string, opts: Options) { }

// ✅ Use parameter object pattern
interface HandlerParams {
  stmt: string;
  newVars: Map<string, VariableEntry>;
  evaluator?: (expr: string, vars: Map<string, VariableEntry>) => Result<number, TuffError>;
}
function handleDeclaration({ stmt, newVars, evaluator }: HandlerParams): Result<void, TuffError> { }
```

See `src/eval/variables.ts` (`VariableHandlerParams`) and `src/eval/ifelse.ts` (`IfExpressionParams`) for real usage.

## Development Workflow

```bash
# Before coding - install dependencies
bun install

# During development - run tests continuously
bun test --watch

# Before commit - verify all checks locally
bun test --coverage          # 57 tests must pass
bun run lint:fix             # Auto-fixes what it can
bun run check:circular       # File-level circular deps
bun run check:subdir-deps    # Subdirectory-level circular deps
bun run check:structure      # Max 8 files/dir
bun run cpd                  # Token-based duplication (PMD)
npm run dupfind              # AST-based duplication

# Commit triggers .husky/pre-commit (runs all 8 checks + visualization)
git commit -m "feat: description"
```

## Common Pitfalls

1. **Exceeding function line limits**: Extract helpers to `*-helpers.ts` files, use comma-separated declarations
2. **File exceeding 200 lines**: Split into multiple files (e.g., `variables.ts` → `variables-helpers.ts`)
3. **Duplication detection**: Use parameter objects, extract shared logic into utility functions
4. **Circular imports**: Respect the layer architecture - never import "upward" (eval → parse, parse → core)
5. **Test failures on commit**: Fix immediately - the pre-commit hook won't let you proceed

## Key Files to Reference

- **Result pattern**: `src/core/result.ts` (17 lines - simple implementation)
- **Error structure**: `src/core/error.ts` (cause, context, reason, fix)
- **Type checking**: `src/utils/types.ts` (widening rules, range validation)
- **Main evaluator**: `src/eval/intepret.ts` (expression routing, parentheses resolution)
- **Helper extraction example**: `src/eval/ifelse-helpers.ts` (8 helpers under 50 lines each)
- **Test patterns**: `tests/intepret.ifelse.test.ts` (isOk guard pattern)
