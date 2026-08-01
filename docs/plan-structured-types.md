# Plan: Structured Type System

## Goal

Replace the string-based type encoding with a structured, discriminated-union `Type` value. Today types are encoded as strings (`"I32"`, `"&I32"`, `"&mut I32"`, `"[I32; 3]"`) and re-parsed with `startsWith`/`slice`/`indexOf` in multiple places. This duplication is fragile and will break down as types nest (e.g. `[[I32; 3]; 2]`, `&[I32; 3]`, `&mut [I32; 3]`). A structured `Type` gives a single, type-safe way to build and inspect types.

## Current State (verified)

Types are encoded as **strings** and parsed ad-hoc in several places:

- **`src/types.ts`**:
  - `isKnownType(name)` — parses `&mut `, `&`, and `[` prefixes with `startsWith`/`slice`/`indexOf`
  - `conversionKind(from, to)` — parses reference and array types with `startsWith`/`slice`/`indexOf`/`lastIndexOf`
  - `typeMatches(from, to)` — string equality + `TYPES` lookup
  - `NODE_TYPES: WeakMap<ASTNode, string>` — stores inferred types as strings
- **`src/checker.ts`**:
  - `ref` case — builds `"&" + inner` / `"&mut " + inner` strings
  - `deref` case — strips `&mut `/`&` with `replace`
  - `deref_assign` case — checks `startsWith("&mut ")`, strips with `replace`
  - `array` case — builds `"[" + elemType + "; " + length + "]"` string
  - `index` case — parses `[X; N]` with `slice`/`indexOf`
  - `fn_decl`/`let_decl` — `isKnownType(node.returnType)` / `isKnownType(param.type)` / `isKnownType(node.typeAnnotation)`
- **`src/parser.ts`**:
  - `parseTypeName()` — builds type strings (`"&" + name`, `"&mut " + name`, `"[" + name + "; " + size + "]"`)
- **`src/ast.ts`**:
  - `FnParam.type: string`, `FnDeclNode.returnType: string`, `LetDeclNode.typeAnnotation?: string`, `FnSignature.returnType: string`

The string encoding is duplicated across `types.ts` and `checker.ts` (both parse `&`/`[` types), and the parser builds strings that the checker/types re-parse.

## Design

Introduce a structured `Type` as a discriminated union:

```ts
type Type =
  | { kind: "named"; name: string } // I32, U8, Bool, Void, Int
  | { kind: "ref"; inner: Type; isMut: boolean } // &T, &mut T
  | { kind: "array"; elem: Type; length: number }; // [T; N]
```

### Key decisions

1. **`Type` is a value, not a string**: All type operations take/return `Type`. The `NODE_TYPES` side-table becomes `WeakMap<ASTNode, Type>`.
2. **Named types stay in the `TYPES` table**: `{ kind: "named", name }` resolves to `TypeInfo` via the existing `TYPES` map. `Int`/`Bool`/`Void` remain named types.
3. **Composite types are built structurally**: `ref`/`array` wrap a `Type` directly, so nesting is natural (`&[I32; 3]` = `{ kind: "ref", inner: { kind: "array", ... }, isMut: false }`).
4. **A `toString()`/`format()` helper** produces the display string (for error messages like `"Unknown type: '...'"` and `typeMismatch` messages), so user-facing messages stay readable.
5. **Parser produces `Type`**: `parseTypeName()` returns a `Type` instead of a string. `FnParam.type`, `FnDeclNode.returnType`, `LetDeclNode.typeAnnotation`, and `FnSignature.returnType` all become `Type`.
6. **`isKnownType` becomes `parseType`-based**: Instead of string parsing, the parser already builds valid `Type` values; `isKnownType(t)` checks a `Type` is well-formed (named type exists, array length ≥ 0, etc.).

## Steps

### Step 1 — Define the `Type` union and helpers (`src/types.ts`)

- Add the `Type` discriminated union.
- Add `formatType(t: Type): string` to render a `Type` for error messages.
- Add `isKnownType(t: Type): boolean` (checks named types exist in `TYPES`, recurses into ref/array).
- Change `NODE_TYPES` to `WeakMap<ASTNode, Type>`; update `setNodeType`/`inferType` to use `Type`.
- Rewrite `conversionKind(from: Type, to: Type)` and `typeMatches(from: Type, to: Type)` to pattern-match on the union instead of string-parsing.

### Step 2 — Update the parser (`src/parser.ts`)

- Change `parseTypeName()` to return a `Type` (build `{ kind: "named" }`, `{ kind: "ref" }`, `{ kind: "array" }` structurally).
- Update `FnParam.type`, `FnDeclNode.returnType`, `LetDeclNode.typeAnnotation` to be `Type`.

### Step 3 — Update the AST (`src/ast.ts`)

- Change `FnParam.type`, `FnDeclNode.returnType`, `LetDeclNode.typeAnnotation`, `FnSignature.returnType` from `string` to `Type`.
- Import `Type` from `types.ts` (or define it in `ast.ts` — decide based on dependency direction; `types.ts` already imports from `ast.ts`, so `Type` likely belongs in `types.ts` and `ast.ts` imports it, OR `Type` lives in `ast.ts` to avoid a cycle).

### Step 4 — Update the checker (`src/checker.ts`)

- `ref` case: build `{ kind: "ref", inner, isMut }` instead of a string.
- `deref` case: pattern-match `{ kind: "ref" }` and return `inner`.
- `deref_assign` case: check `targetType.kind === "ref" && isMut`.
- `array` case: build `{ kind: "array", elem, length }`.
- `index` case: pattern-match `{ kind: "array" }` and return `elem`.
- `fn_decl`/`let_decl`: use `isKnownType(t)` and `typeMismatch` with `Type` values.

### Step 5 — Update error messages

- Where messages embed a type (e.g. `"Unknown type: '...'"`, `typeMismatch`), use `formatType(t)` to render it.

### Step 6 — Verify tests

- All 66 existing tests must still pass (they cover named types, references, mutable references, arrays, `is`, functions, `Void`).
- Add a regression test for a **nested composite type** if feasible (e.g. `&[I32; 3]` or `[[I32; 2]; 2]`) to prove the structured model handles nesting.

### Step 7 — Run hooks

- `bun run lint`, `bun run format`, `bun run cpd`, `bun run cycle` — all must pass.

## Risks / Considerations

- **Dependency direction / import cycle**: `types.ts` currently imports `ASTNode` from `ast.ts`. If `Type` is defined in `types.ts`, then `ast.ts` would need to import `Type` from `types.ts`, creating a cycle (`ast.ts` ↔ `types.ts`). **Resolution**: define `Type` in `ast.ts` (it's a data structure, fits with the AST), and have `types.ts` import it. This keeps the dependency one-directional (`types.ts` → `ast.ts`).
- **`noUncheckedIndexedAccess`**: When reading array elements, guard for `undefined` (existing pattern).
- **ESLint restrictions**: No classes, no `throw`, no backticks, no inline object types (use the named `Type` union members — these are object literals in a union, which is fine; the ban is on `TSTypeLiteral` _type annotations_, not object literal _values_), no `Record` (use `Map`), no default `Error`.
- **Behavioral equivalence**: The structured model must produce identical assignability/type-match results to the current string model. Verify all existing tests pass unchanged.

## Out of Scope

- Adding new primitive types or type features (generics, structs, enums).
- Runtime bounds-checking for arrays.
- Changing the `is` operator semantics.

## Definition of Done

- `Type` is a structured discriminated union (`named` / `ref` / `array`).
- `NODE_TYPES` stores `Type` values, not strings.
- `conversionKind`, `typeMatches`, `isKnownType` pattern-match on `Type` instead of string-parsing.
- The parser builds `Type` values; `FnParam.type`, `returnType`, `typeAnnotation`, `FnSignature.returnType` are `Type`.
- No `startsWith("&")` / `startsWith("[")` / `slice` / `indexOf(";")` type-parsing remains in `types.ts` or `checker.ts`.
- All 66 existing tests pass; hooks pass.
