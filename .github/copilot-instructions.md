# Copilot Instructions for Tuff

## Project Overview

Tuff is a 64-bit virtual machine with a compiler for a typed expression language. The architecture separates concerns: [src/app.ts](../src/app.ts) orchestrates compilation, [src/parser.ts](../src/parser.ts) tokenizes/parses, [src/vm.ts](../src/vm.ts) executes 64-bit instructions on a 4-register, 1024-byte memory VM. Supports arithmetic, variables with type checking, mutable references, pointers, if-expressions, and comparisons.

## Core Architecture & Data Flow

**Compilation Pipeline**: Source → tokenize → parse/validate → generate `Instruction[]` → encode to 64-bit format → execute

**Five Compiler Layers**:

1. **Parser** ([src/parser.ts](../src/parser.ts)) - Tokenization, basic syntax extraction (variables, parentheses, operators, type suffixes)
2. **Arithmetic** ([src/arithmetic-parsing.ts](../src/arithmetic-parsing.ts)) - Recursive descent for add/sub/mul/div expressions with operator precedence
3. **Comparisons** ([src/comparison-parsing.ts](../src/comparison-parsing.ts)) - `==`, `<`, `>`, `<=`, `>=` operators returning Bool type
4. **Variables & Binding** ([src/let-binding.ts](../src/let-binding.ts), [src/let-expression-parsing.ts](../src/let-expression-parsing.ts)) - `let x: Type = expr;` with mutable binding support, context tracking (memory 904+)
5. **App Layer** ([src/app.ts](../src/app.ts)) - Orchestrates all validators, handles parentheses/braces unwrapping, returns `Result<Instruction[], CompileError>`

**Memory Layout** (1024 bytes):

- 0-899: Program instructions (encoded 64-bit)
- 900-903: Temp storage for expr evaluation
- 904-999: Variable storage (context-allocated, `address = 904 + context.length`)
- 950-980: If-expression nesting temp storage

## Critical Implementation Patterns

**Result Type & Error Handling**

```typescript
if (result.ok) {
  const instructions: Instruction[] = result.value;
  // Use instructions
} else {
  const error: CompileError = result.error;
  // Show error.cause, error.reason, error.fix + error.first (location)
}
```

**Instruction Encoding** - 64-bit format (bits 32-39: OpCode, 24-31: Variant, 12-23: Operand1, 0-11: Operand2)

- Use `encodeTo64Bits(instruction)` and `decode(encoded)` only—never manual bit shifting
- Load Immediate: sign-extends 12-bit operand2 automatically for negative constants

**Instruction Addressing** - Three addressing modes in variant:

- `Immediate`: constant value (operand is the value)
- `Direct`: memory address (operand is memory location)
- `Indirect`: pointer lookup (memory[operand] points to actual address)

**Type Compatibility** ([src/types.ts](../src/types.ts))

- Supported types: `U8`, `U16`, `I8`, `I16`, `Bool`, `*Type` (pointer), `*mut Type` (mutable pointer)
- `isTypeCompatible(declared, expr)` allows narrowing: `expr` type must fit in `declared` type
- `U8` → `U16` ✓, `U8` → `I8` ✗, `U16` → `U8` ✗ (narrowing rejected)
- Bool only matches Bool; doesn't coerce to/from integers

**Variable Context Management** ([src/let-binding.ts](../src/let-binding.ts))

```typescript
export interface VariableBinding {
  name: string;
  memoryAddress: number; // 904 + index in context array
  type?: string; // Inferred or annotated
  mutable?: boolean; // let mut x = ...
}
```

- Context is immutable array; new bindings append
- `resolveVariable(context, "x")` returns memory address or undefined
- Variable shadowing detected during validation, not allowed
- Untyped bindings infer type from expression: `let x = read U8;` → x: U8

**Instruction Primitives** ([src/instruction-primitives.ts](../src/instruction-primitives.ts))

- Use helper functions: `buildLoadImmediate()`, `buildLoadDirect()`, `buildStoreDirect()`, `buildStoreAndHalt()`, etc.
- Eliminates repetitive instruction construction, centralizes Variant/OpCode logic

## Expression Compilation & Validation

**Arithmetic Parsing** ([src/arithmetic-parsing.ts](../src/arithmetic-parsing.ts))

- Precedence: `*`, `/` bind tighter than `+`, `-`
- Chained additions `a + b + c` compile as: load a→r1 store→900, load b→r1 store→902, load c→r1, add r1 r0, load+add from stored values
- Parentheses/braces unwrapped by [src/app.ts](../src/app.ts) before arithmetic parsing

**Let-Expression Parsing** ([src/let-expression-parsing.ts](../src/let-expression-parsing.ts))

- Parses `let [mut] varName [: Type] = exprPart; remaining`
- Compiles expression, stores result to allocated variable address, then compiles remaining (if any)
- If remaining is empty, appends Halt instruction

**If-Expression Parsing** ([src/if-expression-parsing.ts](../src/if-expression-parsing.ts))

- Syntax: `if ( condition ) thenBranch else elseBranch`
- Condition must be Bool type; branches must return compatible types
- Uses nesting depth counter to allocate disjoint temp memory slots (950+3N for nested level N)
- Both branches' result addresses unified in final instruction

**Comparison Parsing** ([src/comparison-parsing.ts](../src/comparison-parsing.ts))

- Operators: `==`, `<`, `>`, `<=`, `>=` → OpCode.Equal, LessThan, GreaterThan, etc.
- Returns result (0/1) in register, stored to memory for type tracking
- Type must match on both sides: `read U8 == read U8` ✓, `read U8 == read U16` ✗

**Pointer Support** ([src/pointer-validation.ts](../src/pointer-validation.ts))

- Reference: `&x` creates pointer to x; `&mut x` mutable pointer (requires `let mut`)
- Dereference: `*ptr` loads value from pointer; `*ptr = value` reassigns (only for `*mut`)
- Indirect Load variant used for dereference: Load r1 Indirect from ptr address
- Type: `*U8`, `*I32`, `*Bool`, `*mut Type` (pointer types are distinct)

## Validation System

**Centralized Validators** ([src/validation.ts](../src/validation.ts), [src/pointer-validation.ts](../src/pointer-validation.ts), [src/reassignment-validation.ts](../src/reassignment-validation.ts))

- All called from [src/app.ts](../src/app.ts) `performValidationChecks()` before compilation
- Return `CompileError | undefined` with specific cause, reason, fix, and location

**Shadowing Detection**: Variables in same scope can't redeclare
**Type Mismatch**: Let binding type annotation must match expression type
**Mutability**: Reassignment (`x = value`) only allowed if `let mut x`
**Pointer Safety**: Dereference only on pointer types; only `*mut` can be assigned

## Development Workflow

**Build & Test**: `bun install`, `bun test`, `bun run` (no external runtime)

**Precommit Hooks** (via Husky, enforced on commit):

1. `bun test --coverage` - All tests pass with coverage; blocks commit on failure
2. `bun run lint:fix` - ESLint auto-fixes; blocks if unfixable violations remain
3. `bun run format` - Prettier reformats all files
4. `bun run cpd` - PMD copy-paste detector (≥50 tokens) flags but doesn't block

**Linting Rules** - [eslint.config.mjs](../eslint.config.mjs):

- **No regex**: Use char-by-char iteration (e.g., `findTypeSuffixIndex()`, `findOperatorIndex()`)
- **max-lines-per-function: 50** - Refactor into helpers (e.g., `parseAtom()`, `buildHaltInstruction()`)
- **max-depth: 2** - Extract nested logic to separate functions
- **max-lines: 500** per file - Split large files; whitespace/comments ignored in line count

**TypeScript Strictness** ([tsconfig.json](../tsconfig.json)):

- `noUncheckedIndexedAccess` - Always check array/object access for undefined
- `noFallthroughCasesInSwitch` - All switch cases need break/return
- `noImplicitOverride` - Mark overrides explicitly (N/A here, but enforced)

**Testing** - [tests/app.test.ts](../tests/app.test.ts):

- `assertValid(source, expectedExit, ...stdIn)` - Full compilation + execution round-trip
- `assertInvalid(source)` - Expect compilation error
- Test edge cases: type overflow (256U8), negative unsigned (-100U8), shadowing, pointer misuse

## Key Files & Responsibilities

| File                                                                | Purpose                                                                                        |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [src/app.ts](../src/app.ts)                                         | Orchestrates parse/validate/compile pipeline; calls all validators; unwraps parentheses/braces |
| [src/parser.ts](../src/parser.ts)                                   | Tokenization helpers: suffix extraction, operator finding, parenthesis matching                |
| [src/arithmetic-parsing.ts](../src/arithmetic-parsing.ts)           | Recursive descent for +, -, \*, / with operator precedence                                     |
| [src/let-binding.ts](../src/let-binding.ts)                         | Variable context: allocation, resolution, type tracking, shadowing detection                   |
| [src/let-expression-parsing.ts](../src/let-expression-parsing.ts)   | Parses `let` statements; compiles RHS; stores to allocated address                             |
| [src/comparison-parsing.ts](../src/comparison-parsing.ts)           | Parses ==, <, >, <=, >= returning Bool                                                         |
| [src/if-expression-parsing.ts](../src/if-expression-parsing.ts)     | Parses if-then-else; validates condition is Bool; unifies branch types                         |
| [src/pointer-validation.ts](../src/pointer-validation.ts)           | Validates &, &mut, \* operators; checks type compatibility                                     |
| [src/expression-with-context.ts](../src/expression-with-context.ts) | Arithmetic parsing aware of variable context; resolves variable references                     |
| [src/types.ts](../src/types.ts)                                     | Type range checking, overflow detection, type compatibility rules                              |
| [src/instruction-primitives.ts](../src/instruction-primitives.ts)   | Reusable instruction builders to reduce duplication                                            |
| [src/vm.ts](../src/vm.ts)                                           | Instruction fetch/decode/execute loop; 4 registers, 1024 memory, 1000 cycle max                |

## Common Patterns & Anti-Patterns

✓ **Good**: Parse components into named struct, validate, then compile (separation of concerns)
✓ **Good**: Use instruction primitives for common sequences (`buildStoreAndHalt()`)
✓ **Good**: Return `Instruction[]` from parsers; top-level adds Halt, sub-parsers omit it
✗ **Bad**: Direct bit shifting instead of `encodeTo64Bits()` / `decode()`
✗ **Bad**: Shadowing or redefining variables without validation check
✗ **Bad**: Type inference without explicit validation via `isTypeCompatible()`
