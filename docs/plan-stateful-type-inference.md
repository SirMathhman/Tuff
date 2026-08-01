# Plan: Make Type Inference Stateful & Integrated with the Checker

## Goal

Eliminate the duplicated scope-building logic between `inferType` (in `src/types.ts`) and the checker's `block` case (in `src/checker.ts`). Today `inferType(node, scope)` is a pure function that **re-walks** the AST and **re-simulates** scope. This is a correctness risk (the simulated scope must exactly mirror the checker's real scope) and a performance concern (the AST is walked multiple times). The refactor makes the checker compute each node's type **once** and store it in an external side-table, so type lookup becomes O(1) instead of a re-walk — **without touching the AST node definitions**.

## Current State (verified)

- `inferType(node, scope)` in `src/types.ts` handles: `number` (suffix or `Int`), `boolean` (`Bool`), `identifier` (`scope.typeOf`), `block` (builds a child scope, declares `let`s, returns last statement's type). Returns `undefined` for everything else.
- The checker (`src/checker.ts`) calls `inferType` in exactly **two** places:
  1. `is` case — `const valueType = inferType(node.value, ctx.scope)`
  2. `let_decl` case — twice: for annotation mismatch check, and for `declaredType`
- The checker's `block` case already builds a child scope (`ctx.inChildScope()`) and declares `let`s — this is the duplication.
- AST nodes are plain interfaces in `src/ast.ts`; `IsNode` already carries a mutable `result` field set by the checker (precedent for storing checker-computed data on nodes).

## Design

Store inferred types in an **external side-table**: a module-level `WeakMap<ASTNode, string>` (e.g. in `src/types.ts`). The checker sets the type for each node as it walks (single pass); `inferType` becomes a thin lookup that reads from the map. This avoids adding `type?: string` to every AST node interface — the AST stays a pure data structure, and the type info is ephemeral checker state that doesn't pollute the node definitions.

### Key decisions

1. **Where to store the type**: A module-level `WeakMap<ASTNode, string>` in `src/types.ts` (e.g. `const NODE_TYPES = new WeakMap<ASTNode, string>()`). `WeakMap` is ideal: keys are the AST nodes (objects), it doesn't leak memory, and it needs no changes to `src/ast.ts`. This is the standard "side table" / "attributes map" pattern.
2. **Who computes it**: The checker's `checkNode` computes each node's type and stores it via `setNodeType(node, type)`. This is the single source of truth.
3. **`inferType` becomes a lookup**: `inferType(node)` returns `NODE_TYPES.get(node)`. It no longer takes a `scope` and no longer re-walks blocks.
4. **Block inference**: The checker's `block` case already has the child scope; after checking the last statement, it stores the last statement's type for the block node. No separate scope simulation needed.
5. **`let_decl` ordering**: The checker must compute the RHS type _before_ declaring the variable (it already checks the RHS first). It stores `node.value`'s type during that check, then uses it for the annotation check and `declaredType`.
6. **API surface**: Export small helpers from `src/types.ts` — `setNodeType(node, type)` and `inferType(node)` — so the checker never touches the `WeakMap` directly. This keeps the storage mechanism encapsulated.

## Steps

### Step 1 — Add a type side-table to `src/types.ts`

- Add a module-level `const NODE_TYPES = new WeakMap<ASTNode, string>()`.
- Add `export function setNodeType(node: ASTNode, type: string): void` that writes to it.
- Rewrite `inferType(node)` to return `NODE_TYPES.get(node)` (drop the `scope` param and the block re-walk).
- **No changes to `src/ast.ts`** — the AST node interfaces stay untouched.

### Step 2 — Update the checker to compute and store types (`src/checker.ts`)

- In each `checkNode` case, compute the node's type and call `setNodeType(node, type)`:
  - `number` → `node.suffix ?? "Int"`
  - `boolean` → `"Bool"`
  - `identifier` → `ctx.scope.typeOf(node.name)`
  - `binary_op` → result type of the operands (int/bool; keep current behavior)
  - `is` → `"Bool"` (it's a boolean-valued expression)
  - `if` → type of the branches (both must agree)
  - `block` → type of the last statement (after checking it in the child scope)
  - `while` → statement, no value type (or `undefined`)
- Replace the two `inferType(node.value, ctx.scope)` calls with `inferType(node.value)` (now a lookup).
- In `let_decl`, compute `declaredType` from `inferType(node.value)` (already set by the RHS check).

### Step 3 — Update callers

- `src/checker.ts` is the only caller of `inferType`. Update both call sites to the new signature.
- Grep for any other `inferType` usages to confirm none exist.

### Step 4 — Add/verify tests

- Existing tests must all still pass (they cover `is`, `let` annotations, and block inference).
- Add a regression test for block inference if not already covered: `{ let x = 100U64; x } is U64` => 1 (already exists).
- Consider adding a test for `if`-as-value type inference if we implement it (e.g. `(if (true) 100U8 else 200U8) is U8`).

### Step 5 — Run hooks

- `bun run lint`, `bun run format`, `bun run cpd`, `bun run cycle` — all must pass.

## Risks / Considerations

- **`if`-as-value type inference**: Currently `inferType` returns `undefined` for `if`. If we add type inference for `if`-as-value, we must ensure both branches agree (or pick a common type). This is a behavior change — keep it minimal or defer.
- **`binary_op` result type**: Currently `undefined`. Decide whether to infer int/bool. Keep current behavior unless a test requires otherwise.
- **`noUncheckedIndexedAccess`**: When reading `node.statements[last]`, guard for `undefined` (existing pattern).
- **ESLint restrictions**: No classes, no `throw`, no backticks, no inline object types, no `Record`, no default `Error`. Use named interfaces and `Map`.
- **`IsNode.result` precedent**: The checker already writes computed data to the AST (`IsNode.result`). The `WeakMap` side-table is a cleaner alternative that avoids polluting node definitions — but note the existing `IsNode.result` field remains as-is (it's already part of the AST contract).
- **`WeakMap` availability**: `WeakMap` is standard ES2015+ and available in the Bun/ESNext target. No polyfill needed.
- **Encapsulation**: Keep the `WeakMap` private to `src/types.ts`; expose only `setNodeType`/`inferType` so the storage mechanism can be swapped later (e.g. for a richer type environment) without touching callers.

## Out of Scope

- Adding new types or operators.
- Implementing `if`/`while` type inference beyond what tests require.
- Changing the `is` operator semantics.

## Definition of Done

- `inferType` no longer takes a `scope` and no longer re-walks blocks.
- The checker computes each node's type once and stores it in the `WeakMap` side-table.
- No duplicated scope-building between `types.ts` and `checker.ts`.
- **`src/ast.ts` is unchanged** — no `type?: string` added to any node.
- All 59 existing tests pass; hooks pass.
