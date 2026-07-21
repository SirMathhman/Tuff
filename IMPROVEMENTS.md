### 1. **Structured Error Types** (High impact)

Currently all errors are plain `throw new Error("...")`. Adding position-aware error types would dramatically improve the developer experience:

- `ParseError` with token position & expected vs got
- `TypeError` with source location & type mismatch details
- `RuntimeError` for evaluation-time failures

This requires the tokenizer to emit `{ text: string; line: number; col: number }` instead of plain strings.

### 2. **File Splitting** (Medium impact)

At **1372 lines**, index.ts is approaching the point where navigation becomes painful. Natural split points:

- `ast.ts` — All AST type definitions (~120 lines)
- `tokenizer.ts` — Tokenizer functions (~100 lines)
- `parser.ts` — Parser with precedence climbing (~400 lines)
- `evaluator.ts` — Evaluation logic (~500 lines)
- `typechecker.ts` — Type inference & compatibility (~150 lines)
- `scope.ts` — Scope model & lookup helpers (~50 lines)
- index.ts — Just the `interpret()` entry point + re-exports

### 3. **Type System as Proper AST** (Medium impact)

Types are currently represented as strings (`"U8"`, `"&mut I32"`). This makes type checking string-comparison-heavy and fragile. A type AST would look like:

```ts
type Type = UintType | BoolType | RefType | StructType;
interface UintType {
  kind: "uint";
  bits: 8 | 16 | 32;
}
interface RefType {
  kind: "ref";
  mutable: boolean;
  inner: Type;
}
```

Benefits: exhaustiveness checking, no string parsing in type checks, easier to extend.

### 4. **Scope Separation** (Low-Medium impact)

The `Scope` interface currently mixes 6 concerns: `env`, `mutable`, `types`, `functions`, `functionReturnTypes`, `structs`. Splitting into:

- `EnvScope` — variables + mutability + types
- `DefScope` — functions + structs (inherited, not shadowed)

This matches how real compilers separate lexical scoping from definition scoping.

### 5. **Standard Library** (Feature addition)

No built-in functions exist. Adding `print()`, `len()`, `range()` etc. would make the language usable for real programs. This also opens the door to a `std/` module system.

### 6. **Module System** (Long-term)

Currently everything runs in a single global scope. Adding `import "file.tuff"` would require:

- File resolution & caching
- Per-module scope isolation
- Export/import semantics
