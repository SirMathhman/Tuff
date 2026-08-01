# Plan: Unify the Reference Representation

## Goal

Consolidate the two divergent reference representations in codegen into a single, uniform model: `{ get: () => T, set?: (v: T) => void }`. This removes the split between immutable refs (`{ value }`) and mutable refs (`{ value, set }` with a compile-time-captured variable name), making the runtime representation match the type system's `&T` / `&mut T` distinction and naturally supporting references to arbitrary expressions.

## Current State (verified)

The reference feature currently has **two different runtime representations** in `src/codegen.ts`:

1. **Immutable reference** (`&x`): `({ value: <expr> })` — a plain boxed object.
2. **Mutable reference** (`&mut x`): `({ value: <expr>, set: (v) => { <expr> = v; } })` — a boxed object plus a setter closure that **captures the variable name** at compile time.

Dereference (`*y`) reads `.value`; deref-assignment (`*y = v`) calls `.set(v)`.

### The problem

The mutable-reference setter closure captures the **variable name string** (`<expr>` is the generated JS for the referenced expression). This only works when the referenced expression is a **plain variable** (e.g. `&mut x`). It breaks for:

- References to complex expressions (e.g. `&mut arr[i]`, `&mut obj.field`)
- References returned from functions
- Any case where the target isn't a stable, nameable variable

Meanwhile, immutable refs use a different shape (`{ value }`), so the two are semantically inconsistent. The type system already models `&T` vs `&mut T` uniformly, but codegen does not.

## Design

Represent **all** references uniformly as a getter/setter object:

```ts
// Immutable reference: &T
{ get: () => T }

// Mutable reference: &mut T
{ get: () => T, set: (v: T) => void }
```

- `get` reads the current value of the target.
- `set` (present only on mutable refs) writes a new value to the target.
- Dereference `*y` → `y.get()`.
- Deref-assignment `*y = v` → `y.set(v)`.

This unifies the two representations: a mutable ref is just an immutable ref plus a `set` closure. Both `get` and `set` capture the target expression, so they work for arbitrary expressions, not just plain variables.

### Key decisions

1. **Uniform shape**: Both immutable and mutable refs have a `get` closure. Mutable refs additionally have `set`. This makes `deref` always emit `.get()` and `deref_assign` always emit `.set(...)` — no branching on mutability in codegen.
2. **Closure capture**: `get`/`set` closures capture the _generated JS expression_ for the target. For a plain variable `x`, this is `() => x` / `(v) => { x = v; }`. For a complex expression like `arr[i]`, it's `() => arr[i]` / `(v) => { arr[i] = v; }` — which works because the expression is re-evaluated on each access.
3. **Type system unchanged**: `&T` / `&mut T` types, `isKnownType`, and `conversionKind` already model references correctly and need no change. This plan is purely a codegen/representation change.
4. **Checker unchanged**: The checker already computes `&T` / `&mut T` types and validates `deref_assign` targets are mutable. No change needed.

## Steps

### Step 1 — Update `ref` codegen (`src/codegen.ts`)

Change the `ref` case to emit the uniform getter/setter shape:

- Immutable: `({ get: () => <expr> })`
- Mutable: `({ get: () => <expr>, set: (v) => { <expr> = v; } })`

### Step 2 — Update `deref` codegen (`src/codegen.ts`)

Change `deref` to emit `<expr>.get()` instead of `<expr>.value`.

### Step 3 — Update `deref_assign` codegen (`src/codegen.ts`)

`deref_assign` already emits `<target>.set(<value>)` — no change needed (the `set` method now exists on all mutable refs).

### Step 4 — Verify tests

- All 65 existing tests must still pass, including:
  - `let x = 100; let y : &I32 = &x; *y` => 100 (immutable ref read)
  - `let mut x = 0; let y : &mut I32 = &mut x; *y = 100; x` => 100 (mutable ref write)
- Add a regression test for referencing a non-variable expression if feasible (e.g. a mutable ref to an array element), to prove the unified model handles arbitrary targets.

### Step 5 — Run hooks

- `bun run lint`, `bun run format`, `bun run cpd`, `bun run cycle` — all must pass.

## Risks / Considerations

- **Behavioral equivalence**: The `get`/`set` closure model must produce identical results to the current `{ value }` model for the existing tests. Verify the generated JS is semantically equivalent (e.g. `*y` reads the current value, `*y = v` writes back).
- **`noUncheckedIndexedAccess`**: If adding a test with array indexing, guard for `undefined` (existing pattern).
- **ESLint restrictions**: No classes, no `throw`, no backticks, no inline object types (the emitted JS is a string, so this is fine), no `Record`, no default `Error`.
- **Codegen string building**: The emitted object literal is a JS string; ensure no backticks are used (use string concatenation, per the `no-restricted-syntax` `TemplateLiteral` ban).

## Out of Scope

- Adding array/struct types (only referenced as examples of complex targets).
- Implementing borrow-checking or lifetimes.
- Changing the `&T` / `&mut T` type system or checker semantics.

## Definition of Done

- `ref` codegen emits the uniform `{ get, set? }` shape for both immutable and mutable references.
- `deref` emits `.get()`; `deref_assign` emits `.set(...)`.
- The `{ value }` representation is fully removed from codegen.
- All 65 existing tests pass; hooks pass.
- The runtime representation now matches the type system's `&T` / `&mut T` distinction.
