# Plan: Centralize Reference Cell Mutation in the Environment

## Problem

`ReferenceValue` holds a live `cell` (a `ReferenceCell` with `get`/`set` closures) that
aliases internal state. Today the `Environment` is the single authority over **variable**
binding mutability, but the array-element and struct-field reference cells built in
`resolveRefCell` (in `src/evaluator.ts`) bypass that authority:

- **Array element cells** hardcode `mutable: true` and mutate `arr.elements[index]`
  directly, ignoring the array binding's mutability (which `assignElement` enforces).
- **Struct field cells** hardcode `mutable: true` and mutate `struct.fields[name]`
  directly, ignoring the struct type's field `mutable` flag (which `fieldAssign` enforces).

This means `&mut a[0]` and `&mut p.x` currently succeed even when the underlying target is
immutable, and mutability enforcement is scattered across the evaluator instead of living
in one place. As references grow, this aliasing hazard will keep spreading.

## Goal

Make the `Environment` the single authority over all binding-state mutation by routing
every reference-cell `set` through an `Environment` method that re-checks mutability, and
derive each cell's `mutable` flag from the actual target rather than hardcoding `true`.

## Design

Introduce a small set of `Environment` methods that return `ReferenceCell`s for each
target kind, so `resolveRefCell` becomes a thin dispatcher:

```
Environment.reference(name)            // variable binding (already exists)
Environment.referenceElement(name, i)  // array element, checks binding.mutable
Environment.referenceField(name, f)    // struct field, checks field.mutable
```

Each returns a `ReferenceCell` whose `mutable` reflects the real target and whose `set`
re-checks mutability at write time (mirroring how `assign`/`assignElement`/`fieldAssign`
already behave).

## Steps

### 1. Add `Environment.referenceElement(name, index)`

In `src/environment.ts`, add a method that resolves the binding, verifies it is an array
and the index is in bounds, then returns a cell:

```ts
referenceElement(name: string, index: number): ReferenceCell {
  const binding = this.resolveBinding(name);
  const arr = binding.value;
  if (!isArray(arr)) {
    throw new Error(`Indexing requires an array: ${name}`);
  }
  if (arr.elements[index] === undefined) {
    throw new Error(`Index out of bounds: ${index}`);
  }
  return {
    mutable: binding.mutable,
    get: () => arr.elements[index]!,
    set: (value) => {
      this.resolveMutableBinding(name); // re-check mutability
      arr.elements[index] = value;
    },
  };
}
```

This reuses `resolveBinding`/`resolveMutableBinding` (already extracted for CPD) and
mirrors `assignElement`'s checks.

### 2. Add `Environment.referenceField(name, field)`

Still in `src/environment.ts`, add a method that resolves the binding, verifies it is a
struct, looks up the struct type, and checks the field's `mutable` flag:

```ts
referenceField(name: string, field: string): ReferenceCell {
  const binding = this.resolveBinding(name);
  const struct = binding.value;
  if (!isStruct(struct)) {
    throw new Error(`Field access requires a struct: ${name}`);
  }
  const structType = this.lookup(name);
  if (!isStructType(structType)) {
    throw new Error(`Unknown struct type: ${name}`);
  }
  const fieldSpec = structType.fields[field];
  if (!fieldSpec) {
    throw new Error(`Unknown field: ${field}`);
  }
  return {
    mutable: fieldSpec.mutable,
    get: () => struct.fields[field]!,
    set: (value) => {
      if (!fieldSpec.mutable) {
        throw new Error(`Cannot assign to immutable field: ${field}`);
      }
      struct.fields[field] = value;
    },
  };
}
```

This mirrors the `fieldAssign` evaluator case's mutability logic.

### 3. Simplify `resolveRefCell` in `src/evaluator.ts`

Replace the inline cell construction with calls to the new `Environment` methods. The
`index` branch must first evaluate the index expression to a number, then delegate:

```ts
function resolveRefCell(target: AST, env: Environment): ReferenceCell {
  if (target.type === "identifier") {
    return env.reference(target.name);
  }
  if (target.type === "index") {
    if (target.target.type !== "identifier") {
      throw new Error(`Invalid reference target: ${JSON.stringify(target)}`);
    }
    const index = requireNumber(evaluate(target.index, env), "index");
    return env.referenceElement(target.target.name, index);
  }
  if (target.type === "field") {
    if (target.target.type !== "identifier") {
      throw new Error(`Invalid reference target: ${JSON.stringify(target)}`);
    }
    return env.referenceField(target.target.name, target.name);
  }
  throw new Error(`Invalid reference target: ${JSON.stringify(target)}`);
}
```

Note: this requires the array/struct base to be a plain identifier (e.g. `a[0]`, `p.x`),
which matches the current supported syntax. Nested targets like `a[0].x` are out of scope
for this plan.

### 4. Update `src/types.ts` (if needed)

`ReferenceCell` already has the right shape (`{ mutable, get, set }`), so no type changes
are required. `isStructType` is currently a private helper in `evaluator.ts`; if
`referenceField` needs it, either import it from `typecheck.ts` or move it there.

### 5. Add tests

Add tests that lock in the new mutability enforcement:

- `&mut a[0]` on an **immutable** array binding throws.
- `&mut p.x` on an **immutable** struct field throws.
- Existing positive cases (`&mut a[0]`, `&mut p.x` on mutable targets) still pass.

### 6. Verify

- `bun test` — all tests pass.
- `bunx tsc --noEmit` — clean.
- `bun run cpd` — no new duplication (reuse `resolveBinding`/`resolveMutableBinding`).

## Out of scope

- Nested reference targets (e.g. `&mut a[0].x`, `&mut p.arr[0]`).
- References to struct *types* or other non-value targets.
- Reference lifetimes / borrow checking.

## Acceptance criteria

- `Environment` owns all cell mutation; the evaluator never mutates `arr.elements` or
  `struct.fields` directly through a reference cell.
- `mutable` on every reference cell reflects the real target's mutability.
- Mutability is re-checked at write time, so a cell created while mutable cannot be used
  to write after the target becomes immutable.
- No CPD regressions.
