# Tuff Interpreter - AI Agent Instructions

## Project Overview

Tuff is a TypeScript-based interpreter for a custom programming language featuring **linear types**, **borrow checking**, **move semantics**, and **higher-order functions**. The interpreter evaluates Tuff code strings at runtime.

## Architecture

### Core Design Pattern: Try-Handler Chain

The interpreter uses a **sequential try-handler chain** pattern ([interpret.ts](../src/interpreter/interpret.ts)):

```typescript
// Each handler tries to match a pattern, returns undefined if not matched
const ifResult = tryHandleIfExpression(s, env);
if (ifResult !== undefined) return ifResult;

const callResult = tryHandleCall(s, env);
if (callResult !== undefined) return callResult;
// ... continues through all expression types
```

**When adding new language features:** Create a `tryHandleX()` function that returns `undefined` when the pattern doesn't match, and add it to the chain in [interpret.ts](../src/interpreter/interpret.ts).

### Module Organization

Implementation is split across [src/interpreter/](../src/interpreter/) to satisfy ESLint `max-lines` constraints:

- **[interpret.ts](../src/interpreter/interpret.ts)** - Main entry point, orchestrates try-handler chain
- **[types.ts](../src/interpreter/types.ts)** - Core data structures (`Env`, `EnvItem`, `FunctionValue`, `ArrayValue`, etc.)
- **[statements.ts](../src/interpreter/statements.ts)** - Block evaluation, declarations, control flow exceptions (`YieldValue`, `BreakException`)
- **[functions.ts](../src/interpreter/functions.ts)** - Function definitions, calls, closures, method calls
- **[pointers.ts](../src/interpreter/pointers.ts)** - Pointer operations (`&x`, `*p`), borrow tracking
- **[arrays.ts](../src/interpreter/arrays.ts)** - Array literals, indexing, slices
- **[structs.ts](../src/interpreter/structs.ts)** - Struct definitions, field access, instance methods
- **[shared.ts](../src/interpreter/shared.ts)** - Parsing utilities, borrow checker, type aliases, linear destructors

**Public API:** Only [src/interpret.ts](../src/interpret.ts) is exposed - keep it minimal and delegate to `src/interpreter/`.

## Critical Language Semantics

### Linear Types & Move Semantics

Linear types enforce **single ownership** with automatic cleanup:

```typescript
// Definition: type L = BaseType then destructorFn
type L = I32 then drop;
let x : L = 5;      // x owns the value
let y = x;          // MOVE: ownership transfers to y, x is now invalid
x;                  // Error: "Use-after-move"
```

**Implementation details:**

- Set `EnvItem.moved = true` on move (see [shared.ts](../src/interpreter/shared.ts) `assertCanMoveBinding()`)
- Track destructor via `envLinearDestructorMap` WeakMap in [shared.ts](../src/interpreter/shared.ts)
- Auto-drop at scope exit in [statements.ts](../src/interpreter/statements.ts) `evalBlock()`
- Drop old value on reassignment before assigning new value

### Borrow Checker (Minimal Rust-like)

Borrows prevent moves/mutations while references exist:

```typescript
let mut x : L = 5;
let p : *L = &x;          // Immutable borrow
let q : *mut L = &mut x;  // Error: cannot take &mut while immutable borrows exist
```

**Borrow tracking:** `envItemBorrowCounts` WeakMap in [shared.ts](../src/interpreter/shared.ts) tracks `{immut: number, mut: number}` per `EnvItem`. Borrows are per-item, not per-env, so cloning `Env` (for scopes) preserves borrow state on shared items.

**Key functions:**

- `registerBorrow(env, name, mutable)` - Increments borrow count, validates exclusivity
- `assertCanMoveBinding()` - Throws if borrowed
- `releaseBorrow()` - Decrements count when pointer/slice goes out of scope

### Environment (Env) & Scoping

`Env = Map<string, EnvItem>` stores variable bindings. Block scopes **clone** the map to implement shadowing:

```typescript
const blockEnv = new Map(parentEnv); // Shallow copy - EnvItems are shared
```

**Shadowing tracking:** `blockShadow` WeakMap in [env.ts](../src/interpreter/env.ts) tracks shadowed names to delete them when exiting constructs like for-loops.

**Type aliases** are block-scoped via `envTypeAliasMap` WeakMap in [shared.ts](../src/interpreter/shared.ts).

### Control Flow Exceptions

Non-local control flow uses exceptions:

- **`ReturnValue`** ([returns.ts](../src/interpreter/returns.ts)) - Function returns
- **`YieldValue`** ([statements.ts](../src/interpreter/statements.ts)) - Block expression yields
- **`BreakException`** / **`ContinueException`** - Loop control

These propagate up the call stack until caught by appropriate handlers (functions catch `ReturnValue`, loops catch break/continue).

## Testing Conventions

Tests use **inline Tuff programs** as strings:

```typescript
it("moves ownership and forbids use-after-move", () => {
  const program = `
    fn drop(v: I32) => { 0 };
    type L = I32 then drop;
    let x : L = 10;
    let y = x;
    x  // Should throw
  `;
  expect(() => interpret(program)).toThrow("Use-after-move");
});
```

**Test organization by feature:**

- [linear_types.test.ts](../tests/linear_types.test.ts) - Move semantics, destructors
- [borrow_checker_pointers.test.ts](../tests/borrow_checker_pointers.test.ts) - Borrow validation
- [slices_mutable.test.ts](../tests/slices_mutable.test.ts) - Mutable slicing, borrow conflicts
- [interpret.test.ts](../tests/interpret.test.ts) - Core expressions, arithmetic, blocks

**Run tests:** `pnpm test` (Jest with ts-jest preset)

## Development Workflow

### Commands

- **`pnpm test`** - Run full test suite
- **`pnpm lint`** - ESLint with `--max-warnings 0` (must pass)
- **`pnpm dupfind`** - Find duplicate code (min 15 nodes)

### Code Quality Rules

- **Max lines per file enforced** - Split large files like [statements.ts](../src/interpreter/statements.ts) carefully
- **`/* eslint-disable max-lines */`** comments indicate files at limit
- **Strict TypeScript** - `strict: true` in [tsconfig.json](../tsconfig.json)
- **Husky pre-commit hooks** - Lint must pass before commit

### Parsing Utilities ([shared.ts](../src/interpreter/shared.ts))

Common helpers used throughout:

- `splitTopLevel(s, delimiter)` - Split by delimiter respecting nested brackets
- `findMatchingParen(s, start)` - Find closing bracket from open bracket
- `stripOuterParens(s)` - Remove outer `()` or `{}`
- `parseIdentifierAt(s, pos)` - Parse identifier starting at position
- `extractParenContent(s, keyword)` - Extract `(...)` content after keyword

**When adding new expression types:** Use these utilities for consistent parsing behavior.

## Common Pitfalls

1. **Forgetting to check `EnvItem.moved`** - Always validate before accessing value
2. **Not releasing borrows** - Call `releaseBorrow()` when pointers/slices are dropped
3. **Env cloning vs sharing** - New scopes clone `Env` but share `EnvItem` objects
4. **Return vs Yield** - Functions use `ReturnValue`, blocks use `YieldValue`
5. **Number suffixes** ([numbers.ts](../src/interpreter/numbers.ts)) - Validate range for `U8`, `I32`, etc.

## Key Files Reference

- **Public API:** [src/interpret.ts](../src/interpret.ts) - Single export
- **Main interpreter:** [src/interpreter/interpret.ts](../src/interpreter/interpret.ts) - Try-handler chain
- **Type system:** [src/interpreter/types.ts](../src/interpreter/types.ts) - All runtime value types
- **Parsing:** [src/interpreter/shared.ts](../src/interpreter/shared.ts) - 732 lines of utilities
- **Testing pattern:** [tests/linear_types.test.ts](../tests/linear_types.test.ts) - Example of inline program testing
