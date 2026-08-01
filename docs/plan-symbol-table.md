# Plan: Consolidate the Checker's Symbol Tables

## Goal

Replace the checker's three parallel symbol-tracking structures — the variable `Scope`, the `functions` map, and the `structs` map — with a single unified symbol table threaded through the `CheckContext`. This gives one source of truth for all named declarations, makes name-collision checks a single lookup, and eliminates the risk of the structures drifting out of sync.

## Current State (verified)

The checker (`src/checker.ts`) tracks named declarations across **three** separate structures:

1. **The variable `Scope`** (`ctx.scope`) — tracks variables (name → `Type`, mutability), with lexical inheritance via `child()`.
2. **`functions: Map<string, FnSignature>`** — closure-local to `validateScope`, threaded through `CheckContext` as `ctx.functions`. Tracks function name → `{ params, returnType }`.
3. **`structs: Map<string, StructField[]>`** — closure-local to `validateScope`. Tracks struct name → fields.

Name-collision checks currently consult multiple structures:

- `fn_decl`: `ctx.functions.has(name) || ctx.scope.isDeclared(name)`
- `struct_decl`: `ctx.functions.has(name) || ctx.scope.isDeclared(name)`
- `let_decl`: `ctx.functions.has(name)`

There's also a `resolveStructType(t)` helper that converts a `NamedType` annotation referring to a declared struct into a `StructType` (checks `structs.has(name)`).

## Design

Introduce a single **symbol table**: `Map<string, SymbolInfo>` where `SymbolInfo` is a discriminated union:

```ts
type SymbolInfo =
  | { kind: "variable"; type: Type; isMut: boolean }
  | { kind: "function"; signature: FnSignature }
  | { kind: "struct"; fields: StructField[] };
```

This table is threaded through the `CheckContext` (alongside the variable `Scope`, which still handles lexical scoping for variables). A name exists in the table iff it's a declared function or struct; variables continue to live in the `Scope` (which has lexical inheritance).

### Key decisions

1. **Where the table lives**: Add a `symbols: Map<string, SymbolInfo>` field to `CheckContext`, threaded through `createContext` / `asValue` / `inChildScope` (all child contexts share the same table — functions and structs are effectively global, matching current behavior).
2. **`SymbolInfo` type**: Define it in `src/ast.ts` (next to `FnSignature`/`StructField`) or in `src/checker.ts`. It bundles the three declaration kinds.
3. **Replace `functions` and `structs`**:
   - `ctx.functions` → `ctx.symbols` (lookup by kind)
   - `structs` → `ctx.symbols` (lookup by kind)
4. **Collision checks become a single lookup**: `ctx.symbols.has(name) || ctx.scope.isDeclared(name)`.
5. **`resolveStructType`** reads from `ctx.symbols` instead of the `structs` map.

## Steps

### Step 1 — Define `SymbolInfo` (`src/ast.ts`)

Add the discriminated union:

```ts
export type SymbolInfo =
  | { kind: "variable"; type: Type; isMut: boolean }
  | { kind: "function"; signature: FnSignature }
  | { kind: "struct"; fields: StructField[] };
```

(Use named interfaces for each member to satisfy the `no-restricted-syntax` `TSTypeLiteral` ban.)

### Step 2 — Thread the symbol table through `CheckContext` (`src/checker.ts`)

- Add `symbols: Map<string, SymbolInfo>` to `CheckContext`.
- Update `createContext(scope, symbols, valueContext)` and `asValue`/`inChildScope` to pass it through.
- Update the top-level call in `validateScope` to create the initial context with a fresh `new Map<string, SymbolInfo>()`.

### Step 3 — Remove the closure-local maps (`src/checker.ts`)

- Delete `const functions = new Map<string, FnSignature>()` and `const structs = new Map<string, StructField[]>()`.
- The `FnSignature`/`StructField` imports may become unused if only `SymbolInfo` is referenced — adjust imports.

### Step 4 — Update `fn_decl` (`src/checker.ts`)

- Collision check: `ctx.symbols.has(node.name) || ctx.scope.isDeclared(node.name)`.
- Record: `ctx.symbols.set(node.name, { kind: "function", signature: { params, returnType } })`.

### Step 5 — Update `call` (`src/checker.ts`)

- Lookup: `const sym = ctx.symbols.get(node.name)`; require `sym?.kind === "function"`; use `sym.signature`.

### Step 6 — Update `struct_decl` (`src/checker.ts`)

- Collision check: `ctx.symbols.has(node.name) || ctx.scope.isDeclared(node.name)`.
- Record: `ctx.symbols.set(node.name, { kind: "struct", fields: node.fields })`.

### Step 7 — Update `struct_init` and `member_access` (`src/checker.ts`)

- `struct_init`: `const sym = ctx.symbols.get(node.name)`; require `sym?.kind === "struct"`; use `sym.fields`.
- `member_access`: look up the object's struct type in `ctx.symbols`; require `kind === "struct"`.

### Step 8 — Update `let_decl` and `resolveStructType` (`src/checker.ts`)

- `let_decl` collision check: `ctx.symbols.has(node.name)`.
- `resolveStructType(t)`: check `ctx.symbols` for a struct with that name (requires passing `ctx` or the symbols map).

### Step 9 — Verify tests

- All 67 existing tests must still pass (they cover variables, functions, structs, references, arrays, `is`, `Void`).

### Step 10 — Run hooks

- `bun run lint`, `bun run format`, `bun run cpd`, `bun run cycle` — all must pass.

## Risks / Considerations

- **`resolveStructType` needs the symbols map**: It's currently a closure-local helper. It must either take the symbols map as a parameter or be inlined where `ctx` is available.
- **Variable vs function/struct separation**: Variables stay in the `Scope` (lexically scoped); functions/structs go in the shared `symbols` table. The collision check must consult both — this is already the intent.
- **`noUncheckedIndexedAccess`**: When indexing arrays, guard for `undefined` (existing pattern).
- **ESLint restrictions**: No classes, no `throw`, no backticks, no inline object types (use named interfaces for `SymbolInfo` members), no `Record` (use `Map`), no default `Error`.

## Out of Scope

- Adding namespaces or allowing a struct and function to share a name.
- Changing variable scoping semantics.
- Adding new declaration kinds (enums, type aliases, etc.).

## Definition of Done

- `functions` and `structs` maps are removed.
- A single `Map<string, SymbolInfo>` in `CheckContext` is the sole source of function/struct metadata.
- Collision checks and lookups read from the single table.
- All 67 existing tests pass; hooks pass.
