# Tuff Interpreter - AI Coding Assistant Instructions

## Project Overview

Tuff is a **statically-typed interpreter** for a custom language implemented in TypeScript. It interprets source code strings with full type checking, borrowing rules, and control flow. The entire interpreter logic lives in [src/interpret.ts](src/interpret.ts) (~2140 lines).

## Architecture & Data Model

### Core Evaluation Model

- **Entry point**: `interpret(source: string, scope?: Scope)` → returns `number`
- **Recursive evaluator**: `evaluate(source: string, scope: Scope)` → `EvaluationResult`
- **EvaluationResult**: Contains `{ value: number | (number | number[])[], constraint: TypeConstraint | null, functionBody?, functionParams?, ... }`

### Type System

- **Numeric types**: U8, U16, U32, U64, I8, I16, I32, I64 with automatic bounds checking
- **Boolean**: Bool (0/1, not interchangeable with numeric types)
- **Tuples**: `(I32, Bool)` - heterogeneous, support nested indexing
- **Pointers**: `*I32`, `*mut I32` with borrow checking
- **Function types**: `() => I32` as first-class values
- **Type aliases**: `type Name = BaseType [then dropFn]` for drop hooks

### Scope & Variables

```typescript
interface Scope = Record<string, ScopeEntry>
interface ScopeEntry {
  value: number | (number | number[])[]
  constraint: TypeConstraint | null
  isMutable?: boolean
  isInitialized?: boolean
  functionBody?: string  // For stored functions
  functionParams?: string[]
  functionParamTypes?: (string | undefined)[]
  referenceTarget?: string  // For pointers
  referenceMutable?: boolean
  originalType?: string  // Type alias name if used
}
```

## Key Patterns & Workflows

### 1. Type Constraint Validation

- **Parsing types**: `getTypeConstraint(source: string)` → handles all type syntax including pointers and tuples
- **Value validation**: `validateValueInConstraint(value, constraint, source)` ensures numeric values within bounds
- **Type matching**: `validateTypeMatch(exprConstraint, targetConstraint)` enforces strict equality (no implicit conversions)
  - IMPORTANT: Type aliases must match exactly—`let x = 10U8; let y: U16 = x` throws error even though 10 fits in U16

### 2. Parsing & Expression Handling

The evaluator uses a **split-then-evaluate** approach:

1. Check for statements (semicolon-separated at depth 0)
2. Parse keyword constructs (`if`, `while`, `for`, `match`, `fn`, `let`, `type`)
3. Parse binary operators from lowest to highest precedence: `=`, `&&`/`||`, comparisons, `+`/`-`, `*`/`/`
4. Handle unary ops: `-x`, `!x`, `&x`, `*x`
5. Evaluate literals, variables, function calls

**Depth tracking** is critical for parsing:

```typescript
function updateDepth(char, depth) {
  if (char === "(" || "{") return depth + 1;
  if (char === ")" || "}") return depth - 1;
  return depth;
}
```

Use this when scanning for operators/keywords at depth 0.

### 3. Function Definition & Invocation

**Declaration syntax**:

- Named: `fn name(a: Type, b: Type) : ReturnType => body`
- Anonymous: `(a: Type) : ReturnType => body`
- Methods: `fn add(this : I32, other : I32) : I32 => this + other; 3.add(4)`

**Invocation**:

- Functions stored as `ScopeEntry` with `functionBody`, `functionParams`, `functionParamTypes`
- Call creates new scope, evaluates body with parameters bound
- For methods, first arg becomes the receiver (e.g., `3.add(4)` parses as method call)

### 4. Block Scoping & Variable Lifetime

- Variables declared with `let` are local to the block (braced `{}`)
- **Drop hooks**: If type has `drop fn`, called automatically when var goes out of scope
  - Detection: `type Name = BaseType then dropFn` syntax
  - Hook signature: `fn dropFn(this : TypeName) => body`
- Variable references in remaining statements trigger early drop (last-use semantics)

### 5. Borrow Checking

- `borrowState: Map<string, { immutableCount, mutableCount }>`
- `&x`: immutable borrow (multiple allowed)
- `&mut x`: mutable borrow (only one, conflicts with immutable)
- `addBorrow()` / `releaseBorrow()` manage state; throws on conflicts
- Pointers track target via `referenceTarget` and mutability via `referenceMutable`

### 6. Pattern Matching

```typescript
match (expr) {
  case pattern1 => value1;
  case pattern2 => value2;
  case _ => default;
}
```

- Must be exhaustive (wildcard `_` required for non-Bool)
- For Bool, exhaustiveness = has both `true` and `false` OR has `_`
- Patterns are literal expressions evaluated against discriminant

### 7. Control Flow

- **if/else**: `if (cond) then_expr else else_expr` - both branches must have same type
- **while**: `while (cond) body` - cond must be Bool
- **for**: `for (let [mut] var in range) body` where range is `0..10` or generator function
- **Generator syntax**: `let gen : () => (Bool, I32) = 0..10` creates tuple returner `(hasNext, value)`

## Common Implementation Patterns

### Adding a New Operator

1. Add to operator precedence chain in `findOperator()` regex
2. Validate operand types with `ensureNumericOperand()` or `ensureBoolOperand()`
3. Execute operation, validate result with `validateValueInConstraint()`
4. Return `{ value: result, constraint: inferredType }`

### Adding a Keyword Construct

1. Use `parseKeywordParen(source, keyword)` to extract condition/parameters
2. Parse remaining string for body/branches
3. Validate branch types match (for if/match)
4. Create isolated scope for variables declared in block
5. Don't forget to call drop hooks when scope ends

### Handling Type Aliases

- Store mapping in local `typeAliases` dict during block evaluation
- When resolving `let x : AliasName = expr`, look up actual type: `typeAliases[AliasName] || AliasName`
- Store original alias name in `ScopeEntry.originalType` for `is` operator checks

## Testing & Validation

- **Test file**: [tests/interpret.test.ts](tests/interpret.test.ts) (544 lines, Bun test framework)
- **Run tests**: `bun test`
- **Linting**: `bun run lint` (tsc --noEmit)
- **Formatting**: `bun run format` (Prettier)
- Tests cover: type bounds, arithmetic, variables, functions, tuples, references, borrowing, control flow

## Critical Implementation Details

1. **Numeric literals without type suffix default to `I32`** (not unconstrained)
2. **Division is floor division** (`Math.floor()`)
3. **Tuple indexing returns element type** from `constraint.tupleTypes[index]`
4. **Variables referenced in remaining code skip drop hooks** (last-use heuristic)
5. **Uninitialized variables cannot be dereferenced** - check `isInitialized` flag
6. **Reassignment requires mutability** - `let x = 10; x = 20` throws "immutable"
7. **Compound assignments (`+=`) require initialization** - cannot use `+=` on declared-but-uninitialized vars

## Resources & Commands

- **Build/Run**: `bun run index.ts` (Bun is the JavaScript runtime)
- **Duplicate code detection**: `bun run cpd` (PMD copy-paste detector, 35 token minimum)
- All dependencies: Husky (git hooks), Prettier (formatting), TypeScript (compiler)
