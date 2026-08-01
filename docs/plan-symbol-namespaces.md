# Plan: Separate the Symbol Table into Distinct Namespaces

## Goal

Eliminate the `"struct:" + name` key-prefixing hack in `src/checker.ts` by splitting the single flat `Map<string, SymbolInfo>` into two distinct namespaces: one for functions and one for structs. This lets a constructor function and its implicit struct coexist under the same name naturally, removes the fragile string-prefix workaround, and makes struct-field resolution a single-key lookup.

## Current State (verified)

`validateScope` in `src/checker.ts` maintains a single flat symbol table:

```ts
const symbols = new Map<string, SymbolInfo>();
```

where `SymbolInfo = VariableSymbol | FunctionSymbol | StructSymbol` (defined in `src/ast.ts`). This table is threaded through `CheckContext` as `ctx.symbols` and shared across all child contexts.

The constructor feature (added recently) introduced a **name collision**: a constructor function `fn Wrapper(field : I32) : Wrapper => this` needs BOTH a function symbol `Wrapper` (for calls) AND a struct symbol `Wrapper` (for `this.field` / `Wrapper(100).field`). Because the table is keyed by name, the code works around this by storing the implicit struct under a prefixed key:

- `fn_decl` stores the implicit struct at `ctx.symbols.set("struct:" + implicitStruct.name, ...)` (line ~331).
- `member_access` on `this` looks up `"struct:" + thisType.name` (line ~160).
- `member_access` on a struct-typed object tries BOTH `objectType.name` AND `"struct:" + objectType.name` (lines ~188-196).
- `call` checks `ctx.symbols.has("struct:" + sig.returnType.name)` to detect a constructor (line ~402).

### Problems

1. **Fragile string-prefix coupling**: The `"struct:"` prefix is a magic string scattered across 4+ call sites. Any typo or missed site silently breaks field resolution.
2. **Two-key lookup**: `member_access` on a struct object must try two keys, which is redundant and error-prone.
3. **`SymbolInfo` union is misleading**: `VariableSymbol` is never actually stored in `ctx.symbols` (variables live in the `Scope`), so the union overstates what the table holds.
4. **Collision-prone**: As more nameable entities are added (methods, type aliases, etc.), the flat-map-plus-prefix pattern will keep accumulating.

## Design

Replace the single `Map<string, SymbolInfo>` with two maps threaded through the context:

```ts
interface CheckContext {
  scope: Scope;
  // Functions and structs live in separate namespaces so a constructor
  // function and its implicit struct can share a name.
  functions: Map<string, FnSignature>;
  structs: Map<string, StructField[]>;
  valueContext: boolean;
  thisType: Type | undefined;
  asValue(): CheckContext;
  inChildScope(): CheckContext;
  withThis(thisType: Type | undefined): CheckContext;
}
```

### Key decisions

1. **Two maps, not one**: `functions: Map<string, FnSignature>` and `structs: Map<string, StructField[]>`. This removes the need for `SymbolInfo` entirely in the checker (see step 6).
2. **`createContext` signature**: becomes `createContext(scope, functions, structs, valueContext, thisType)`. All context-deriving methods (`asValue`, `inChildScope`, `withThis`) pass both maps through unchanged (they're shared, not copied).
3. **Implicit structs stored directly**: `fn_decl` stores the implicit struct at `structs.set(implicitStruct.name, fields)` — no prefix. The function goes in `functions.set(node.name, sig)`. Both coexist because they're different maps.
4. **Single-key field lookup**: `resolveStructField` becomes `resolveStructField(structs, structName, property)` — one map, one key, no prefix, no two-key fallback.
5. **Constructor detection**: `call` checks `structs.has(sig.returnType.name)` instead of `ctx.symbols.has("struct:" + ...)`.

## Steps

1. **`src/ast.ts`**: Remove `SymbolInfo` (and `VariableSymbol`/`FunctionSymbol`/`StructSymbol`) if they become unused after the refactor. Verify no other file imports them (grep). If `FnSignature`/`StructField` are still needed (they are — used by `FnDeclNode`/`StructDeclNode`), keep those.

2. **`src/checker.ts` — context**: Change `CheckContext.symbols` to `functions: Map<string, FnSignature>` and `structs: Map<string, StructField[]>`. Update `createContext` and all three deriving methods to thread both maps.

3. **`src/checker.ts` — `validateScope`**: Replace `const symbols = new Map<string, SymbolInfo>()` with `const functions = new Map<string, FnSignature>()` and `const structs = new Map<string, StructField[]>()`. Update the bottom `createContext(...)` call.

4. **`src/checker.ts` — `fn_decl`**:
   - Name-collision check: `functions.has(node.name) || structs.has(node.name) || ctx.scope.isDeclared(node.name)`.
   - Store signature: `functions.set(node.name, { params, returnType })`.
   - Store implicit struct (no prefix): `structs.set(implicitStruct.name, node.params.map(...))`.

5. **`src/checker.ts` — `member_access`**:
   - `this` + struct `thisType`: `resolveStructField(ctx.structs, thisType.name, node.property)`.
   - struct-typed object: `resolveStructField(ctx.structs, objectType.name, node.property)` — single lookup, no fallback.

6. **`src/checker.ts` — `call`**: `const sig = ctx.functions.get(node.name)`; error if undefined. Constructor detection: `ctx.structs.has(sig.returnType.name)`.

7. **`src/checker.ts` — `struct_decl` / `struct_init`**:
   - `struct_decl`: collision check `functions.has(node.name) || structs.has(node.name) || ctx.scope.isDeclared(node.name)`; store `structs.set(node.name, node.fields)`.
   - `struct_init`: `const fields = ctx.structs.get(node.name)`; error if undefined.

8. **`src/checker.ts` — `let_decl`**: collision check `functions.has(node.name) || structs.has(node.name)`.

9. **`src/checker.ts` — `resolveStructType`**: change `ctx.symbols.get(t.name)` to `ctx.structs.has(t.name)`.

10. **`src/checker.ts` — `resolveStructField`**: change signature to `(structs: Map<string, StructField[]>, structName: string, property: string)` and drop the `key` param.

11. **Run hooks**: `bun test` (all 101 must pass), `bun run lint`, `bun run format`, `bun run cpd`, `bun run cycle`.

## Risks / Notes

- **`noUncheckedIndexedAccess`**: `Map.get` returns `T | undefined`; the existing `sym === undefined` guards must be preserved (now `sig === undefined` / `fields === undefined`).
- **ESLint restrictions**: no classes (use the existing factory style), no `Record` (use `Map`), no inline object types (use named interfaces like `FnSignature`/`StructField`).
- **No behavior change**: this is a pure refactor. All 101 tests must pass unchanged; no new language features.
- **`SymbolInfo` removal**: only remove it if nothing else imports it. `FnSignature` and `StructField` are used by the AST node types and must stay.
- **CPD**: the refactor should _reduce_ duplication (the two-key fallback in `member_access` disappears), which is the opposite direction of the CPD hook's concern.
