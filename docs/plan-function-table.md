# Plan: Consolidate Function Metadata into a Single Function Table

## Goal

Eliminate the three parallel data structures that currently track function metadata in `src/checker.ts`, replacing them with a single `Map<string, FnSignature>` threaded through the `CheckContext`. This removes the risk of the structures drifting out of sync and gives a single source of truth for function identity, parameters, and return type.

## Current State (verified)

The checker (`src/checker.ts`) tracks functions across **three** separate closure-local structures inside `validateScope`:

1. **`fnParams: Map<string, FnParam[]>`** — maps function name → parameter list (used by `call` to validate argument count/types).
2. **`fnNames: Set<string>`** — tracks which names are functions (used by `fn_decl` and `let_decl` for name-collision checks).
3. **The variable `Scope`** — `ctx.scope.declare(node.name, false, node.returnType)` stores the function's **return type** as if it were a variable's type (used by `call` to resolve the call's type via `ctx.scope.typeOf`).

Function identity is therefore split across three places that must be kept in sync:

- `fnNames` says "this name is a function"
- `fnParams` says "this function's params are ..."
- `Scope` says "this function's return type is ..."

The name-collision check in `fn_decl` consults both `ctx.scope.isDeclared(node.name)` and `fnNames.has(node.name)`; the `let_decl` check consults `fnNames.has(node.name)`.

## Design

Introduce a single **function table**: `Map<string, FnSignature>` where

```ts
interface FnSignature {
  params: FnParam[];
  returnType: string;
}
```

This table is threaded through the `CheckContext` (alongside the variable `Scope`) so it's available wherever `checkNode` runs. A function exists in the table iff it's declared; its params and return type live together.

### Key decisions

1. **Where the table lives**: Add a `functions: Map<string, FnSignature>` field to `CheckContext`, and thread it through `createContext` / `asValue` / `inChildScope` (all child contexts share the same table reference — functions are not lexically scoped per-block in the current design, so a single shared map is correct and matches current behavior).
2. **`FnSignature` type**: Define it in `src/ast.ts` next to `FnParam` (or in `src/checker.ts`). It bundles `params` and `returnType`.
3. **Replace the three structures**:
   - `fnParams` → `ctx.functions.get(name)?.params`
   - `fnNames` → `ctx.functions.has(name)`
   - `Scope`-stored return type → `ctx.functions.get(name)?.returnType`
4. **Collision check becomes a single lookup**: `ctx.functions.has(node.name) || ctx.scope.isDeclared(node.name)`.
5. **`call` type resolution**: Use `ctx.functions.get(node.name)?.returnType` instead of `ctx.scope.typeOf(node.name)`.

## Steps

### Step 1 — Define `FnSignature` (`src/ast.ts`)

Add an interface bundling params and return type:

```ts
export interface FnSignature {
  params: FnParam[];
  returnType: string;
}
```

(Place next to `FnParam`.)

### Step 2 — Thread the function table through `CheckContext` (`src/checker.ts`)

- Add `functions: Map<string, FnSignature>` to the `CheckContext` interface.
- Update `createContext(scope, valueContext, functions)` to accept and store it.
- Update `asValue()` and `inChildScope()` to pass the same `functions` reference through (child contexts share the table).
- Update the top-level call in `validateScope` to create the initial context with a fresh `new Map<string, FnSignature>()`.

### Step 3 — Remove the closure-local structures (`src/checker.ts`)

- Delete `const fnParams = new Map<string, FnParam[]>()` and `const fnNames = new Set<string>()`.
- The `FnParam` import may become unused if only `FnSignature` is referenced — adjust imports accordingly.

### Step 4 — Update `fn_decl` (`src/checker.ts`)

- Collision check: `if (ctx.functions.has(node.name) || ctx.scope.isDeclared(node.name))`.
- Record the signature: `ctx.functions.set(node.name, { params: node.params, returnType: node.returnType })`.
- Remove `fnParams.set(...)`, `fnNames.add(...)`, and `ctx.scope.declare(node.name, false, node.returnType)` (the function no longer lives in the variable scope).

### Step 5 — Update `call` (`src/checker.ts`)

- Declared check: `if (!ctx.functions.has(node.name))`.
- Params lookup: `const sig = ctx.functions.get(node.name)`; use `sig.params` for count/type validation.
- Call type: `setNodeType(node, sig?.returnType ?? "Int")` (drop `ctx.scope.typeOf`).

### Step 6 — Update `let_decl` (`src/checker.ts`)

- Collision check: `if (ctx.functions.has(node.name))`.

### Step 7 — Verify tests

- All 62 existing tests must still pass (they cover functions, calls, params, and the name-collision error).
- The name-collision test `let get = 0; fn get() : I32 => 0;` => scope must still pass.

### Step 8 — Run hooks

- `bun run lint`, `bun run format`, `bun run cpd`, `bun run cycle` — all must pass.

## Risks / Considerations

- **Function scoping**: The current design declares functions in the _current_ scope (a `fn` inside a block is scoped to that block). The shared `Map` in `CheckContext` does NOT replicate per-block function scoping — it's a single global table. This matches the _current_ behavior only if functions are effectively global. **Verify**: if the existing tests rely on block-scoped functions, the shared map would change semantics. If block-scoping matters, the table should be per-scope (like `Scope`) rather than shared. This is the main design decision to confirm.
- **Variable/function name separation**: Moving functions out of the variable `Scope` means a variable and a function can no longer collide via `Scope` — the collision check must explicitly consult both `ctx.functions` and `ctx.scope`. This is already the intent.
- **`noUncheckedIndexedAccess`**: When indexing `node.args[i]` / `params[i]`, guard for `undefined` (existing pattern).
- **ESLint restrictions**: No classes, no `throw`, no backticks, no inline object types (use the named `FnSignature` interface), no `Record` (use `Map`), no default `Error`.

## Out of Scope

- Adding recursion, overloads, first-class functions, or default arguments (the table makes these easier but they're separate features).
- Changing function scoping semantics beyond what's needed to preserve current behavior.

## Definition of Done

- `fnParams`, `fnNames`, and the `Scope`-stored return type are all removed.
- A single `Map<string, FnSignature>` in `CheckContext` is the sole source of function metadata.
- Collision checks and call validation read from the single table.
- All 62 existing tests pass; hooks pass.
