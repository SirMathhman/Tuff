# Plan: Record Constructor Identity on the Function Signature

## Goal

Eliminate the duplicated, re-derived logic for determining whether a function is a **constructor** and what its implicit struct is named. Today this "is this a constructor?" fact is computed in **two separate places** in the checker:

1. **`fn_decl` case** — computes `isConstructorBody`, `explicitStructName`, `implicitStructName`, and `implicitStruct` to register the implicit struct in `ctx.structs`.
2. **`call` case** — re-derives `constructorStructName` from `declaredReturn` + `ctx.structs.has(...)` to resolve a constructor call's return type to the struct type.

The goal is to make "is this a constructor" a **single, authoritative fact** stored on the function's signature (`FnSignature`), computed once in `fn_decl`, and read directly by the `call` case (and any future consumers) instead of being re-derived.

## Current State (verified)

### `FnSignature` (`src/ast.ts`)

```ts
export interface FnSignature {
  params: FnParam[];
  returnType: Type;
}
```

### Checker `fn_decl` case (`src/checker.ts`)

Computes the constructor's implicit struct name via a multi-step derivation:

```ts
const isConstructorBody =
  node.body.kind === "this" ||
  (node.body.kind === "member_access" && node.body.object.kind === "this") ||
  (node.body.kind === "block" &&
    node.body.statements[node.body.statements.length - 1]?.kind === "this");
const explicitStructName =
  node.returnType.kind === "named" && !isKnownType(node.returnType)
    ? node.returnType.name
    : undefined;
const implicitStructName =
  explicitStructName ??
  (isConstructorBody &&
  node.returnType.kind === "named" &&
  node.returnType.name === "Int"
    ? node.name
    : undefined);
const implicitStruct: Type | undefined =
  implicitStructName !== undefined
    ? { kind: "struct", name: implicitStructName }
    : undefined;
```

It then registers the struct in `ctx.structs` and threads `implicitStruct` as `ctx.thisType`.

### Checker `call` case (`src/checker.ts`)

Re-derives the constructor's struct name from the return type and the struct table:

```ts
const constructorStructName =
  declaredReturn.kind === "named" && ctx.structs.has(declaredReturn.name)
    ? declaredReturn.name
    : declaredReturn.kind === "named" &&
        declaredReturn.name === "Int" &&
        ctx.structs.has(node.name)
      ? node.name
      : undefined;
const returnType: Type =
  constructorStructName !== undefined
    ? { kind: "struct", name: constructorStructName }
    : declaredReturn;
```

### The problem

The `call` case re-derives what `fn_decl` already computed. This is fragile for several reasons:

- **Duplication**: The "constructor struct name" logic exists in two places and can drift apart.
- **Heuristic coupling**: The `call` case infers "constructor" from `ctx.structs.has(node.name)` — it assumes a struct registered under the function's name means the function is a constructor. This is an indirect, implicit relationship rather than an explicit fact.
- **Ordering sensitivity**: The `call` case relies on `ctx.structs` already containing the struct, which depends on `fn_decl` having run first. If a constructor is ever called before its declaration is processed (or the struct registration changes), the re-derivation breaks.

## Design

Store the constructor's implicit struct name **on the `FnSignature`** when the function is registered in `fn_decl`. The `call` case then reads it directly.

### Key decisions

1. **Add an optional `implicitStructName` field to `FnSignature`.** It is `undefined` for ordinary functions and set to the struct name for constructors. This makes "is this a constructor" an explicit, stored fact rather than a re-derived heuristic.

2. **`fn_decl` computes it once.** The existing `implicitStructName` derivation stays in `fn_decl` (it's the natural place — it has the body and return type), but the result is stored on the signature instead of being recomputed later.

3. **`call` reads it directly.** Replace the `constructorStructName` re-derivation with a lookup of `sig.implicitStructName`. This removes the `ctx.structs.has(...)` heuristic and the ordering sensitivity.

4. **`identifier` case (first-class functions) is unaffected.** A constructor used as a value still resolves to its declared `returnType` (e.g. `Int` for an unannotated constructor). The `implicitStructName` is only consulted when resolving a _call's_ return type, not a function value's type. (This matches current behavior.)

## Steps

### Step 1 — Add `implicitStructName` to `FnSignature` (`src/ast.ts`)

```ts
export interface FnSignature {
  params: FnParam[];
  returnType: Type;
  // The name of the implicit struct a constructor function defines, or
  // undefined for ordinary functions. Set once in the checker's fn_decl case
  // so the call case can resolve a constructor call's return type without
  // re-deriving it.
  implicitStructName?: string;
}
```

### Step 2 — Store it in `fn_decl` (`src/checker.ts`)

When registering the signature, include the computed `implicitStructName`:

```ts
ctx.functions.set(node.name, {
  params: node.params,
  returnType: node.returnType,
  implicitStructName,
});
```

This requires moving the `implicitStructName` computation **before** the `ctx.functions.set(...)` call (currently it's computed after). The `implicitStruct` type and `ctx.structs.set(...)` registration remain unchanged.

### Step 3 — Read it in `call` (`src/checker.ts`)

Replace the `constructorStructName` re-derivation with a direct lookup:

```ts
const constructorStructName =
  sig !== undefined ? sig.implicitStructName : undefined;
const returnType: Type =
  constructorStructName !== undefined
    ? { kind: "struct", name: constructorStructName }
    : declaredReturn;
```

Note: for a first-class call (`fnType` path), `sig` is `undefined`, so `constructorStructName` is `undefined` and the return type falls back to `declaredReturn` — matching current behavior.

### Step 4 — Verify tests

- All existing tests must still pass, including:
  - `fn Wrapper(field : I32) : Wrapper => this; Wrapper(100).field` → 100 (explicit annotation constructor).
  - `fn Wrapper(field : I32) => this; fn get(this : Wrapper) => this.field; let wrapper = Wrapper(100); wrapper.get()` → 100 (unannotated constructor used as a method receiver).
  - `fn Pair(a : I32, b : I32) : Pair => this; let p = Pair(3, 4); p.a + p.b` → 7.
  - `fn Wrapper() : Wrapper => { let field = 100; this } Wrapper().field` → 100 (block-body constructor).
  - `compile("fn Wrapper(field : I32) : Wrapper => this; Wrapper(100).missing")` → scope (unknown field still errors).
- Add a regression test if feasible for a first-class function value that is a constructor (to confirm the `fnType` path still resolves to the declared return type).

### Step 5 — Run hooks

- `bun run lint`, `bun run format`, `bun run cpd`, `bun run cycle` — all must pass.

## Risks / Considerations

- **Ordering of `ctx.functions.set` and `implicitStructName` computation**: The `implicitStructName` derivation currently sits after `ctx.functions.set(...)`. Step 2 requires moving the derivation above the `set` call. This is a pure reordering within `fn_decl`; the `ctx.structs.set(...)` registration and `ctx.thisType` threading are unaffected.
- **First-class constructor values**: A constructor used as a value (e.g. `let f = Wrapper;`) resolves to its declared `returnType` (e.g. `Int`), not the struct type. This is unchanged — `implicitStructName` is only consulted for call return-type resolution. Confirm no test relies on a constructor _value_ having the struct type.
- **`noUncheckedIndexedAccess`**: When reading `node.body.statements[...]`, guard for `undefined` (existing pattern).
- **ESLint restrictions**: No classes, no `throw`, no backticks, no inline object types (use named interfaces), no `Record`, no default `Error`.
- **Behavioral equivalence**: The only intended change is removing the `call`-case re-derivation. All currently-passing tests must produce identical results.

## Out of Scope

- Adding `impl` blocks or associated-function syntax.
- Changing how constructors are declared (the `isConstructorBody` / `explicitStructName` derivation stays as-is).
- Changing the `FnSignature` shape for non-constructor functions.

## Definition of Done

- `FnSignature` has an optional `implicitStructName` field.
- `fn_decl` computes and stores `implicitStructName` on the signature once.
- `call` resolves a constructor call's return type by reading `sig.implicitStructName`, with no `ctx.structs.has(...)` heuristic or return-type re-derivation.
- All existing tests pass; hooks pass.
