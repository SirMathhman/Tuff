# Tuff Language Interpreter

A test-driven AST-based interpreter for the Tuff language, built incrementally with one test per feature.

## Commands

| Command | Purpose |
|---|---|
| `npm test` | Run all tests (Bun test framework) |
| `npm run lint` | Run ESLint with auto-fix |
| `npm run cpd` | PMD CPD duplication detection (`--minimum-tokens 50 --ignore-literals --ignore-identifiers`) |

## Architecture

Split into ESM modules under `src/`:

| File | Purpose |
|---|---|
| `src/errors.ts` | `Position`, `Token`, `TuffError`, `ParseError`, `TypeError`, `RuntimeError` |
| `src/ast.ts` | All AST interfaces (`Program`, `Statement`, `Expr`, etc.), `StructValue`, `RefValue`, `isRefValue()` |
| `src/scope.ts` | `Scope` interface, `FunctionInfo`, `createScope()`, `lookup()`, `findScope()`, `lookupValue()` |
| `src/tokenizer.ts` | `tokenize()` — emits `Token[]` with line/col positions |
| `src/parser.ts` | `parse()` — precedence-climbing parser, emits AST |
| `src/typechecker.ts` | `inferExprType()`, `checkTypeCompatibility()`, `validateTypeRange()` |
| `src/evaluator.ts` | `evaluateProgram()`, `evaluateExpr()`, all `eval*` helpers |
| `src/interpreter.ts` | `interpret()` glue: `tokenize → parse → evaluateProgram` |
| `src/index.ts` | Re-exports `interpret()` and error classes |
| `test/index.test.ts` | Test suite. One test per feature, format: `interpret("...") => expected`. |

### Core Flow
`interpret(source)` → `tokenize()` → `parse()` → `evaluateProgram(ast, scopes)` → returns last expression value (or `0`).

### AST Nodes
- **Statements**: `ExprStatement`, `LetStatement` (with `typeAnnotation`), `AssignStatement`, `CompoundAssignStatement`, `DerefAssignStatement`, `BlockStatement`, `IfStatement`, `WhileStatement`, `FunctionDefStatement` (with `params`, `returnAnnotation`), `StructDefStatement` (with `fields`)
- **Expressions**: `BinaryExpr`, `NumberLiteral` (with `typeAnnotation`), `Identifier`, `BooleanLiteral`, `CallExpr` (with `arguments`), `StructLiteral` (with `structName`, `fields`), `FieldAccess` (with `object`, `field`), `RefExpr` (with `operand`, `mutable`), `DerefExpr` (with `operand`)

### Grammar Hierarchy (highest to lowest precedence)
`parseFactor` (literals, identifiers, parens, calls, struct literals, field access) → `parseTerm` (`*`, `/`) → `parseExpression` (`+`, `-`) → `parseAndExpression` (`&&`) → `parseOrExpression` (`||`)

### Scope Model
Stack of `{ env: Record<string, number | StructValue | RefValue>; mutable: Set<string>; types: Record<string, string | null>; functions: Record<string, FunctionInfo>; functionReturnTypes: Record<string, string | null>; structs: Record<string, StructField[]> }`. Block `{}` pushes/pops. Lookup walks innermost → outermost. `let mut` adds to `mutable` set; assignment requires mutable flag. `StructValue` is a recursive type for nested structs. `RefValue` is `{ __ref: true; name: string; mutable: boolean }`.

### Type System
- **Types**: `U8` (0–255), `U16` (0–65535), `U32` (0–4294967295), `Bool`, `I32` (unvalidated), user-defined struct types
- **Literals**: `100U8`, `256U16` — range-validated at parse/eval time
- **Declarations**: `let x: U8 = 100` — type annotation on variable
- **Widening**: Narrower types can widen to wider types (`U8` → `U16` OK, `U16` → `U8` Error)
- **Comparisons**: `<`, `>`, `<=`, `>=`, `==`, `!=` produce `Bool` type
- **Control flow**: `if` and `while` conditions must be `Bool`
- **Assignments**: Type compatibility checked at assignment site

### Functions
- **Declaration**: `fn name(params) : ReturnType => body` — stored in scope, callable via `name(args)`
- **Parameters**: Typed with `param : Type`, duplicate param names are rejected at parse time
- **Return type**: Optional `: Type` annotation — checked against actual return expression
- **Arguments**: Type-checked against parameter types at call site

### Structs
- **Definition**: `struct Name { field : Type, ... }` — stored in scope, duplicate struct names rejected
- **Literals**: `Name { field : value, ... }` — all fields required, no extra fields allowed, field types checked against definition
- **Field access**: `obj.field` — supports nested access (`obj.inner.field`)
- **Nested structs**: Struct fields can reference other struct types (e.g., `Line { start : Point }`)

### References
- **Immutable reference**: `&x` — creates a `RefValue` pointing to identifier `x`, type `&T`
- **Mutable reference**: `&mut x` — requires `x` to be declared `mut`, type `&mut T`
- **Dereference**: `*ref` — reads the current value from the referenced variable
- **Deref assignment**: `*ref = val` — writes through the reference (requires `&mut`)
- **Type inference**: `inferRefType` returns `&T` or `&mut T`; `inferDerefType` strips the `&` prefix
- **RefValue**: `{ __ref: true; name: string; mutable: boolean }` — stored in scope, resolved at eval time

## Conventions

- **TDD workflow**: User provides `interpret("...") => expected`, agent adds test, runs `npm test`, fixes implementation if needed.
- **ESLint complexity rule**: Max complexity `10`. Refactor into small helpers when approaching limit.
- **Boolean semantics**: `true` → `1`, `false` → `0` internally. Logical operators use JS `||`/`&&` on numeric values.
- **Result semantics**: Last expression statement's value is returned. Declarations and assignments return `0`.

## Known Pitfalls

- Parser queue gotcha: if parser emits queued statements (syntax-lowering), EOF loops must drain the queue or trailing declarations are silently dropped.
- ASI gotcha: Never format dynamically generated JS with a newline after `return`.
- Type inference: `inferExprType` returns `null` for untyped expressions — always handle `null` in type checks.
- Struct values: `evaluateExpr` returns `number | StructValue` — all call sites must handle both types. Use `typeof val === 'number' ? val : 0` when a number is expected.
- Reference values: `evaluateExpr` also returns `RefValue` — use `isRefValue()` helper to check. When a number is expected, convert with `typeof val === 'number' ? val : (isRefValue(val) ? 0 : 0)`.
