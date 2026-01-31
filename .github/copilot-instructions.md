# Copilot Instructions for Tuff

## Project Overview

**Tuff** is a statically-typed systems language compiler implemented in TypeScript that compiles to JavaScript. It features a type system with numeric types, pointers, mutability tracking, and compile-time validation.

### Language Features

- **Numeric types**: U8/U16/U32/U64 (unsigned), I8/I16/I32/I64 (signed), F32/F64 (float), with compile-time range validation
- **Type annotations**: `let x : Type = value` or inferred `let x = 100U8` (defaults to I32)
- **Mutability**: `let` (immutable) vs `let mut` (mutable); immutability enforced at compile time
- **Pointers**: `*Type` (immutable pointer), `*mut Type` (mutable pointer), `&mut x` (reference), `*ptr` (dereference)
- **Structs**: `struct Name { field: Type; }` with instantiation `Name { value1, value2 }`
- **Functions**: `fn name(param: Type) : ReturnType => body` (body can be expression or block)
- **Control flow**: `if/else` (expressions when both branches present), `while` loops
- **Block expressions**: `{ statements; final_expr }` — last expression is return value
- **Special types**: `Bool`, `Char` (converted to UTF-8 code), `This` (captures function context)

## Architecture & Compilation Pipeline

The compiler transforms Tuff source → JavaScript through a multi-stage process in [../src/index.ts](../src/index.ts):

```
Tuff source → stripComments → extract top-level (declarations + expression)
→ validate types → convert syntax → generate JS → evaluate
```

### Key Modules

- **[compiler.ts](../src/compiler.ts)**: Core compilation logic — block statement parsing, type validation/inference, let statement parsing. Exports `parseBlockStatements()`, `validateAndStripTypeAnnotations()`, `extractAndValidateTypesInExpression()`, `parseLetStatement()`
- **[compileHelpers.ts](../src/compileHelpers.ts)**: Parser for language constructs — `parseIfExpression()`, `parseIfStatement()`, `parseWhileStatement()`, `parseFunctionDeclaration()`, `parseStructDefinition()`, `normalizeExpression()`. Uses balanced delimiter tracking with `readBalanced()` and depth state machines
- **[conversionUtils.ts](../src/conversionUtils.ts)**: Syntax transformations — numeric suffix stripping, char literals → UTF-8, `&mut x` → `{value: x}`, `*ptr` → `ptr.value`, `this.prop` → `prop`, comment removal
- **[blockUtils.ts](../src/blockUtils.ts)**: Block expression handling — converts `{ stmts; expr }` to IIFEs for embedding in expressions
- **[structUtils.ts](../src/structUtils.ts)**: Global struct registry and instantiation — maps `StructName { vals }` to `{field1: val1, ...}`
- **[types.ts](../src/types.ts)**: Type system constants — `typeRanges`, `TYPE_ORDER`, `TYPE_FAMILIES`, validation functions (`validateInRange()`, `validateVariableTypeCompatibility()`), type coercion rules (`determineCoercedType()`)
- **[stringState.ts](../src/stringState.ts)**: String literal tracking for parser — prevents delimiter matching inside strings

### Type System Rules

**Type families**: Unsigned ints, signed ints, floats — mixing families is an error. Within a family, smaller types coerce to larger (U8 + U16 → U16), larger to smaller is rejected.

**Assignment validation**: Source type priority must be ≤ target type priority within the same family. Example:

```typescript
let x : U16 = 100U8;  // ✓ U8 fits in U16
let y : U8 = 100U16;  // ✗ Type mismatch: cannot assign U16 to U8
```

**Overflow/underflow checking**: Arithmetic expressions with typed literals are evaluated at compile time; out-of-range results throw errors.

**Block expression types**: Inferred from last statement's type or variables referenced in it (see `inferBlockExpressionType()` in [compiler.ts](../src/compiler.ts)).

## Developer Workflows

### Building & Running

- `npm run build` — Compile TypeScript to `dist/`
- `npm start` — Compile `src/main.tuff` to `src/main.js` and execute it (exit code printed)
- `npm run watch` — Hot reload on changes to `src/**/*.ts` or `src/main.tuff`
- Pass `--repl` flag to launch interactive REPL instead of compiling main.tuff

### Testing

- `npm test` — Run Jest suite ([tests/index.test.ts](../tests/index.test.ts))
- `npm test:watch` — Watch mode for TDD
- **Test helpers**: `assertInterpret(source, expected)`, `assertInterpretNaN(source)`, `assertValid(input, expectedJS?)`, `assertInvalid(input)` — all defined at top of test file
- Pattern: Test both `compile()` output correctness AND `interpret()` runtime behavior

### Code Quality

- `npm run lint` — Run TSC type checking + ESLint (both must pass)
- `npm run cpd` — PMD copy-paste detection (35+ token threshold)

## Project Conventions

### Parser Implementation Patterns

**Balanced delimiter reading**: Use `readBalanced(input, start, open, close)` from [compileHelpers.ts](../src/compileHelpers.ts) for matching `()`, `{}`, `[]` — tracks depth and respects string boundaries via `StringState`

**Depth state tracking**: Many parsers use `DepthState = {paren, brace, bracket}` to detect top-level positions for control flow parsing

**Keyword detection**: Use `isKeywordAt(input, idx, keyword)` to ensure word boundaries (prevents matching `ifx` when looking for `if`)

**Expression scanning**: `scanExpression()` reads until delimiter/keyword, respecting nesting and string literals

### String Building Conventions

Use string concatenation (`+`) not template literals for output JS generation (matches project style). Example from [compileHelpers.ts](../src/compileHelpers.ts):

```typescript
const statement = "while (" + conditionExpr + ") {" + body + "}";
```

### Error Messages

Format: `throw new Error("Category: details")` — Examples:

- `"Type mismatch: cannot assign U16 to U8"`
- `"Underflow: -200 is below minimum for I8 (-128)"`
- `"Cannot assign to immutable variable 'x'. Declare it with 'let mut'"`

### TypeScript Patterns

- **CommonJS require**: Add `// eslint-disable-next-line @typescript-eslint/no-explicit-any` + `const fs = require("fs") as any` when using require (see [src/index.ts](../src/index.ts))
- **Regex with capture groups**: Destructure with `const [, group1, group2] = match` (skips full match at index 0)
- **Unused params**: Prefix with `_` to satisfy linter (e.g., `(_num: string, type: string)`)

### Test Patterns

Tests compile Tuff source and verify:

1. **Valid compilation**: `assertValid(input, expectedJS)` checks no errors + optional JS output match
2. **Runtime behavior**: `assertInterpret(source, expectedNumber)` evaluates compiled JS and checks result
3. **Error cases**: `assertInvalid(input)` verifies compile-time rejection

Example pattern from [tests/index.test.ts](../tests/index.test.ts):

```typescript
test("compile throws error for mixed type arithmetic", () => {
  assertInvalid("1U8 + 2I8"); // Different type families
});
```

## File References

- **Entry point**: [src/index.ts](../src/index.ts) — `compile()`, `interpret()`, `startRepl()`, `compileFile()`
- **Main test suite**: [tests/index.test.ts](../tests/index.test.ts)
- **Example program**: [src/main.tuff](../src/main.tuff)
- **Type definitions**: [src/types.ts](../src/types.ts) — All type ranges and validation
- **Configs**: [tsconfig.json](../tsconfig.json) (strict mode, ES2019), [eslint.config.js](../eslint.config.js) (flat config)
