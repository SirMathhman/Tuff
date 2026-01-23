# Copilot Instructions for Tuff

## Project Overview

Tuff is a 64-bit virtual machine with a compiler for a typed expression language. The architecture separates concerns: [src/app.ts](../src/app.ts) orchestrates compilation, [src/parser.ts](../src/parser.ts) tokenizes/parses, [src/vm.ts](../src/vm.ts) executes 64-bit instructions on a 4-register, 1024-byte memory VM. Supports arithmetic, variables with type checking, mutable references, pointers, if-expressions, comparisons, and arrays.

## Core Architecture & Data Flow

**Compilation Pipeline**: Source → tokenize → parse/validate → generate `Instruction[]` → encode to 64-bit format → execute

**Ten Compiler Layers** (ordered by `tryAllPatterns()` in app.ts):

1. **Parser** ([src/parsing/parser.ts](../src/parsing/parser.ts)) - Tokenization, basic syntax extraction (variables, parentheses, operators, type suffixes)
2. **Let Expressions** ([src/parsing/expressions/let-expression-parsing.ts](../src/parsing/expressions/let-expression-parsing.ts)) - `let [mut] x [: Type] = expr;` with context allocation
3. **While Loops** ([src/parsing/expressions/while-expression-parsing.ts](../src/parsing/expressions/while-expression-parsing.ts)) - `while (condition) { body }` with jump instruction generation
4. **Basic Reassignments** ([src/compilation/compilation-strategies.ts](../src/compilation/compilation-strategies.ts) → `tryReassignment`) - Simple `x = expr`, including compound ops (`+=`, `-=`, `*=`, `/=`)
5. **Arithmetic with Context** ([src/parsing/expression-with-context.ts](../src/parsing/expression-with-context.ts)) - Binary operators with variable resolution via generic `parseArithmeticExpressionWithContext()` helper
6. **Array Operations** ([src/compilation/compilation-strategies.ts](../src/compilation/compilation-strategies.ts)) - Array indexing, literals, and field access (slices)
7. **Braced Expressions** ([src/compilation/compilation-strategies.ts](../src/compilation/compilation-strategies.ts) → `tryBracedExpression`) - Recursive unwrapping of `{ ... }`
8. **If Expressions** ([src/parsing/expressions/comparison-parsing.ts](../src/parsing/expressions/comparison-parsing.ts)) - Conditional branching with type-unified branches
9. **Arithmetic (Context-Free)** ([src/parsing/arithmetic-parsing.ts](../src/parsing/arithmetic-parsing.ts) → `parseArithmeticOrLiteral`) - Fallback for `+/-/*/` without variables
10. **App Layer** ([src/app.ts](../src/app.ts)) - Orchestrates all validators, coordinates strategy handlers, returns `Result<Instruction[], CompileError>`

**Memory Layout** (1024 bytes):

- 0-899: Program instructions (encoded 64-bit)
- 900-903: Temp storage for expr evaluation (900=primary result, 901=read result, 902-903=misc temp)
- 904+: Variable storage (arrays allocated contiguously, scalars at 904, 905, etc.)
- 950-951+: Register preservation for compound ops & nested expressions (r1 saved to 951 during arithmetic eval)

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

**Compilation Strategies Pattern** ([src/compilation/compilation-strategies.ts](../src/compilation/compilation-strategies.ts))

- Each `try*` function (tryReassignment, tryDereference, tryArrayIndexing, etc.) follows: `(source, context, compileFunc) → { instructions, context } | undefined`
- Return undefined if pattern doesn't match; caller tries next strategy
- Each handler encapsulates one syntax/semantic concern without orchestration logic
- Strategies are **order-dependent**: app.ts `tryAllPatterns()` attempts let → basic → arithmetic → arrays → braced in sequence
- Always use `compileFunc` to recursively compile sub-expressions with current context

**Type Compatibility** ([src/types/types.ts](../src/types/types.ts))

- Supported types: `U8`, `U16`, `I8`, `I16`, `Bool`, `*Type` (pointer), `*mut Type` (mutable pointer), `[Type; InitLen; TotalLen]` (arrays)
- `isTypeCompatible(declared, expr)` allows narrowing: `expr` type must fit in `declared` type
- `U8` → `U16` ✓, `U8` → `I8` ✗, `U16` → `U8` ✗ (narrowing rejected)
- Bool only matches Bool; doesn't coerce to/from integers
- Array types must match exactly: `[U8; 2; 2]` ≠ `[U16; 2; 2]`

**Variable Context Management** ([src/support/let-binding.ts](../src/support/let-binding.ts))

```typescript
export interface VariableBinding {
  name: string;
  memoryAddress: number; // 904 + sum of previous variable sizes
  type?: string; // Inferred or annotated
  mutable?: boolean; // let mut x = ...
  declarationOnly?: boolean; // let x: Type; (no init)
}
```

- Context is immutable array; new bindings append
- `resolveVariable(context, "x")` returns memory address or undefined
- Variable shadowing detected during validation, not allowed
- Untyped bindings infer type from expression: `let x = read U8;` → x: U8
- Declaration-only variables (no init) must be assigned before use; allow single assignment if immutable

**Instruction Primitives** ([src/compilation/instruction-primitives.ts](../src/compilation/instruction-primitives.ts))

- Use helpers: `buildLoadImmediate()`, `buildLoadDirect()`, `buildStoreDirect()`, `buildStoreAndHalt()`, etc.
- Centralizes Variant/OpCode logic, eliminates manual instruction construction errors

**Debug Execution Tracing** ([src/support/debug-dump.ts](../src/support/debug-dump.ts))

- `ExecutionState`: registers, memory, PC, exit code, `prettyPrint()` method
- `Cycle`: instruction + state before execution
- `execute()` accepts optional `dumper(state, instruction)` callback for instruction-by-instruction tracing (used in tests/diagnostics)

## Expression Compilation & Validation

**Compound Assignment Operators** (`+=`, `-=`, `*=`, `/=`)

- Syntactic sugar: `x += expr` transforms to `x = x + expr` internally
- Detection: [src/parsing/reassignment-parsing.ts](../src/parsing/reassignment-parsing.ts) → `findCompoundOperator()` checks for operator char before `=`
- Operand types supported: variables, constants, read expressions, arithmetic expressions (`x += 2I32 + 3I32`)
- Context-aware parsing: [src/parsing/expression-with-context.ts](../src/parsing/expression-with-context.ts) provides `parseAddExpressionWithContext()`, `parseSubExpressionWithContext()`, etc.
- **Critical Pattern - Register Preservation**: When evaluating arithmetic on right operand:
  ```typescript
  // Save r1 (left value) to preserve during arithmetic evaluation
  Store r1 to memory[951]
  // Evaluate right-side arithmetic (clobbers r1)
  compileNoContext(arithmetic_expr)
  // Restore r1 from memory[951]
  Load r1 from memory[951]
  // Load result to r0 for binary operation
  Load r0 from memory[900]
  ```
- Reason: Nested arithmetic expressions use r1; without preservation, left operand value is lost

**Arithmetic Parsing** ([src/parsing/arithmetic-parsing.ts](../src/parsing/arithmetic-parsing.ts))

- Precedence: `*`, `/` bind tighter than `+`, `-`
- Chained additions `a + b + c` compile as: load a→r1 store→900, load b→r1 store→902, load c→r1, add r1 r0, load+add from stored values
- Parentheses/braces unwrapped by [src/app.ts](../src/app.ts) before arithmetic parsing
- Context-free fallback: `parseArithmeticOrLiteral()` for expressions without variable context (used in base layer)

**Let-Expression Parsing** ([src/parsing/expressions/let-expression-parsing.ts](../src/parsing/expressions/let-expression-parsing.ts))

- Parses `let [mut] varName [: Type] = exprPart; remaining`
- Compiles expression, stores result to allocated variable address, then compiles remaining (if any)
- If remaining is empty, appends Halt instruction
- Declaration-only syntax: `let x: Type;` (no equals, no expr)

**If-Expression Parsing** ([src/parsing/expressions/comparison-parsing.ts](../src/parsing/expressions/comparison-parsing.ts))

- Syntax: `if ( condition ) thenBranch else elseBranch`
- Condition must be Bool type; branches must return compatible types
- Uses nesting depth counter to allocate disjoint temp memory slots (950+3N for nested level N)
- Both branches' result addresses unified in final instruction

**While-Loop Parsing** ([src/parsing/expressions/while-expression-parsing.ts](../src/parsing/expressions/while-expression-parsing.ts))

- Syntax: `while (condition) { body }`
- Compiles condition as Bool expression
- Generates jump instruction at start and conditional jump at end for loop control
- Allows variables from surrounding scope to be mutated in loop body
- Loop condition and body both compiled with same context for variable modifications

**Comparison Parsing** ([src/parsing/expressions/comparison-parsing.ts](../src/parsing/expressions/comparison-parsing.ts))

- Operators: `==`, `<`, `>`, `<=`, `>=` → OpCode.Equal, LessThan, GreaterThan, etc.
- Returns result (0/1) in register, stored to memory for type tracking
- Type must match on both sides: `read U8 == read U8` ✓, `read U8 == read U16` ✗

**Expression Resolution with Context** ([src/parsing/expression-with-context.ts](../src/parsing/expression-with-context.ts))

- **Pattern**: Resolve operands to registers via context-aware lookups, skip context-free fallback
- **Operand Types** (resolution order in `resolveRightOperand()`):
  1. Variable reference: `tryResolveVariableAtom(part, context, 0)` → loads from context
  2. Numeric literal: `parseNumberWithSuffix(part)` → load immediate
  3. Read expression: `parseReadInstruction(part)` → in r0
  4. Arithmetic expression: `resolveArithmeticOperand(part)` → with r1 preservation
- **Generic Helper**: `parseArithmeticExpressionWithContext(source, context, splitFunc, opcode)` unifies all four operators (+, -, \*, /)
  - Each operator-specific function (`parseAddExpressionWithContext`, etc.) delegates to generic with operator-specific split function
  - Eliminates 15-line duplication across 4 functions

**Array Support** ([src/parsing/array-parsing.ts](../src/parsing/array-parsing.ts), [src/compilation/compilation-strategies.ts](../src/compilation/compilation-strategies.ts))

- Array type format: `[ElementType; InitializedCount; TotalCapacity]` (e.g., `[U8; 2; 2]`)
- Array literals: `[expr1, expr2, ...]` — elements compiled sequentially and stored to base address
- Array indexing: `array[index]` — dynamic or constant indices, computed address loaded indirectly
- Array assignment: `let mut array[i] = expr;` — requires mutable array, stores to computed address
- Arrays allocated contiguously from base address; `array[0]` at base, `array[i]` at base+i
- Distinction between `initializedLength` (elements provided) and `totalLength` (allocated slots)

**Pointer Support** ([src/validation/pointer-validation.ts](../src/validation/pointer-validation.ts))

- Reference: `&x` creates pointer to x; `&mut x` mutable pointer (requires `let mut`)
- Dereference: `*ptr` loads value from pointer; `*ptr = value` reassigns (only for `*mut`)
- Indirect Load variant used for dereference: Load r1 Indirect from ptr address
- Type: `*U8`, `*I32`, `*Bool`, `*mut Type` (pointer types are distinct)
- Cannot mix mutable and immutable references to same variable in one scope

**Function Support** ([src/parsing/function-parsing.ts](../src/parsing/function-parsing.ts), [src/compilation/function-compilation.ts](../src/compilation/function-compilation.ts))

- Syntax: `fn name(param1: Type1, param2: Type2) : ReturnType => body` or lambda `(params) => expr`
- Functions are first-class values: can be assigned to variables, passed in if-expressions, called via variables
- Type: `(ParamType1, ParamType2, ...) => ReturnType` (inferred from body when not explicit)
- Parameters stored at memory[960..], allowing function context to shadow outer variables
- Function calls compile arguments to parameter slots, compile body with parameter context, return result
- Validation: uncalled function references (bare function variable without `()`) are compilation errors

## Validation System

**Centralized Validators** ([src/validation/validation.ts](../src/validation/validation.ts), [src/validation/pointer-validation.ts](../src/validation/pointer-validation.ts), [src/validation/reassignment-validation.ts](../src/validation/reassignment-validation.ts), [src/validation/function-validation.ts](../src/validation/function-validation.ts))

- All called from [src/app.ts](../src/app.ts) `performValidationChecks()` before compilation
- Return `CompileError | undefined` with specific cause, reason, fix, and location

**Shadowing Detection**: Variables in same scope can't redeclare
**Type Mismatch**: Let binding type annotation must match expression type
**Mutability**: Reassignment (`x = value`) only allowed if `let mut x`
**Pointer Safety**: Dereference only on pointer types; only `*mut` can be assigned
**Array Mutability**: Array element assignment (`array[i] = value`) only on `let mut array`
**Reference Borrowing**: Cannot mix mutable (`&mut`) and immutable (`&`) references to same variable
**Declaration-Only**: Variables declared without init (e.g., `let x: Type;`) must be assigned before use; immutable declaration-only vars can only be assigned once
**Function Calls**: Uncalled function references (variable without `()`) are compilation errors; function variables can only be called with correct argument count

## Directory Structure

**Organization Strategy**: Tuff uses a flat-hierarchy subdirectory approach (max 10 `.ts` files per directory) to maintain code organization and prevent single directories from becoming unwieldy as the project grows.

**Directory Layout**:

```
src/
  ├─ app.ts                          # Main compilation entry point
  ├─ core/                           # Core virtual machine
  │  └─ vm.ts
  ├─ parsing/                        # Expression parsing
  │  ├─ parser.ts                    # Tokenization primitives
  │  ├─ arithmetic-parsing.ts
  │  ├─ array-parsing.ts
  │  ├─ expression-with-context.ts
  │  ├─ function-parsing.ts
  │  ├─ operator-parsing.ts
  │  ├─ reassignment-parsing.ts
  │  ├─ slice-parsing.ts
  │  └─ expressions/                 # Expression-specific parsing
  │     ├─ comparison-parsing.ts
  │     ├─ let-expression-parsing.ts
  │     └─ while-expression-parsing.ts
  ├─ compilation/                    # Code generation
  │  ├─ compilation-strategies.ts
  │  ├─ function-compilation.ts
  │  └─ instruction-primitives.ts
  ├─ validation/                     # Type and semantic validation
  │  ├─ validation.ts
  │  ├─ pointer-validation.ts
  │  ├─ reassignment-validation.ts
  │  └─ function-validation.ts
  ├─ types/                          # Type system
  │  ├─ types.ts
  │  ├─ variable-types.ts
  │  ├─ function-types.ts
  │  ├─ type-inference-helpers.ts
  │  └─ array-helpers.ts
  └─ support/                        # Support & utilities
     ├─ let-binding.ts
     ├─ function-context.ts
     ├─ debug-dump.ts
     └─ helpers.ts
```

**Enforcement**: Run `bun run check:structure` to verify no directory exceeds 10 TypeScript files. This check runs automatically in pre-commit hooks.

**When Refactoring**: If a directory approaches 10 files, create a new subdirectory for related functionality. For example, expression-specific parsing was extracted to `src/parsing/expressions/` when `src/parsing/` exceeded the limit.

**Build & Test**: `bun install`, `bun test`, `bun run` (no external runtime)

**Precommit Hooks** (via Husky, enforced on commit):

1. `bun test --coverage` - All tests pass with coverage; blocks commit on failure
2. `bun run lint:fix` - ESLint auto-fixes; blocks if unfixable violations remain
3. `bun run format` - Prettier reformats all files
4. `bun run check:circular` - Madge circular dependency detection
5. `bun run check:structure` - Validates max 10 .ts files per directory (enforces scalable structure)
6. PMD copy-paste detector (≥50 tokens) flags and blocks
7. `npm run visualize` - Generates dependency graph

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

**Core & App**

| File                                | Purpose                                                                                        |
| ----------------------------------- | ---------------------------------------------------------------------------------------------- |
| [src/app.ts](../src/app.ts)         | Orchestrates parse/validate/compile pipeline; calls all validators; unwraps parentheses/braces |
| [src/core/vm.ts](../src/core/vm.ts) | Instruction fetch/decode/execute loop; 4 registers, 1024 memory, 1000 cycle max                |

**Parsing** (src/parsing/)

| File                                                                                | Purpose                                                                             |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [src/parsing/parser.ts](../src/parsing/parser.ts)                                   | Tokenization helpers: suffix extraction, operator finding, parenthesis matching     |
| [src/parsing/arithmetic-parsing.ts](../src/parsing/arithmetic-parsing.ts)           | Recursive descent for +, -, \*, / with operator precedence                          |
| [src/parsing/function-parsing.ts](../src/parsing/function-parsing.ts)               | Parses function definitions and calls                                               |
| [src/parsing/reassignment-parsing.ts](../src/parsing/reassignment-parsing.ts)       | Detects reassignment patterns incl. compound ops; parses left/right expr parts      |
| [src/parsing/operator-parsing.ts](../src/parsing/operator-parsing.ts)               | Finds comparison/arithmetic/add operators in source; splits expressions by operator |
| [src/parsing/expression-with-context.ts](../src/parsing/expression-with-context.ts) | Parses arithmetic expressions with variable context; resolves operands              |
| [src/parsing/array-parsing.ts](../src/parsing/array-parsing.ts)                     | Array type parsing and literal detection ([Type; initLen; totalLen])                |
| [src/parsing/slice-parsing.ts](../src/parsing/slice-parsing.ts)                     | Parses slice field access (slice.initialized, slice.capacity)                       |

**Parsing/Expressions** (src/parsing/expressions/)

| File                                                                                                      | Purpose                                                                |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| [src/parsing/expressions/let-expression-parsing.ts](../src/parsing/expressions/let-expression-parsing.ts) | Parses `let` statements; compiles RHS; stores to allocated address     |
| [src/parsing/expressions/comparison-parsing.ts](../src/parsing/expressions/comparison-parsing.ts)         | Parses ==, <, >, <=, >= returning Bool and if-then-else expressions    |
| [src/parsing/expressions/while-expression-parsing.ts](../src/parsing/expressions/while-expression-parsing.ts) | Parses while loops with jump instruction generation              |

**Compilation** (src/compilation/)

| File                                                                                      | Purpose                                                                     |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [src/compilation/compilation-strategies.ts](../src/compilation/compilation-strategies.ts) | Strategy pattern handlers for reassignment, dereference, arrays, references, functions |
| [src/compilation/function-compilation.ts](../src/compilation/function-compilation.ts)     | Compiles function calls with instruction generation                         |
| [src/compilation/instruction-primitives.ts](../src/compilation/instruction-primitives.ts) | Reusable instruction builders to reduce duplication                         |

**Validation** (src/validation/)

| File                                                                                      | Purpose                                                                  |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| [src/validation/validation.ts](../src/validation/validation.ts)                           | Core validators: shadowing, type compatibility, if-expression validation |
| [src/validation/pointer-validation.ts](../src/validation/pointer-validation.ts)           | Validates &, &mut, \* operators; checks reference borrowing rules        |
| [src/validation/reassignment-validation.ts](../src/validation/reassignment-validation.ts) | Validates reassignments, mutability, type safety                         |
| [src/validation/function-validation.ts](../src/validation/function-validation.ts)         | Validates function calls, argument counts, uncalled function references  |

**Types** (src/types/)

| File                                                                          | Purpose                                                           |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| [src/types/types.ts](../src/types/types.ts)                                   | Type range checking, overflow detection, type compatibility rules |
| [src/types/variable-types.ts](../src/types/variable-types.ts)                 | Variable context types and interfaces                             |
| [src/types/function-types.ts](../src/types/function-types.ts)                 | Function context and binding types                                |
| [src/types/type-inference-helpers.ts](../src/types/type-inference-helpers.ts) | Type inference utilities                                          |
| [src/types/array-helpers.ts](../src/types/array-helpers.ts)                   | Array type parsing and helpers                                    |

**Support** (src/support/)

| File                                                                  | Purpose                                                              |
| --------------------------------------------------------------------- | -------------------------------------------------------------------- |
| [src/support/let-binding.ts](../src/support/let-binding.ts)           | Variable context: allocation, resolution, type tracking              |
| [src/support/function-context.ts](../src/support/function-context.ts) | Function definition extraction and context management                |
| [src/support/debug-dump.ts](../src/support/debug-dump.ts)             | Interfaces for execution state tracing (ExecutionState, Cycle, Dump) |
| [src/support/helpers.ts](../src/support/helpers.ts)                   | Utility functions shared across modules                              |

## Common Patterns & Anti-Patterns

✓ **Good**: Parse components into named struct, validate, then compile (separation of concerns)
✓ **Good**: Use instruction primitives for common sequences (`buildStoreAndHalt()`)
✓ **Good**: Return `Instruction[]` from parsers; top-level adds Halt, sub-parsers omit it
✗ **Bad**: Direct bit shifting instead of `encodeTo64Bits()` / `decode()`
✗ **Bad**: Shadowing or redefining variables without validation check
✗ **Bad**: Type inference without explicit validation via `isTypeCompatible()`

## Refactoring & Code Organization

**Strategy for Adding Features**:

1. Add tests first in `tests/app.test.ts` (use `assertValid()` or `assertInvalid()`)
2. Implement parser logic in domain-specific modules (e.g., new operator parsing in separate file)
3. Add validation in `validation.ts`, `reassignment-validation.ts`, or `pointer-validation.ts`
4. Add strategy handler in `compilation-strategies.ts` if pattern-matching is needed
5. Update `app.ts` `tryAllPatterns()` to coordinate new strategy
6. Update this file's **Key Files** table and patterns

**Code Deduplication**:

- PMD copy-paste detector (CPD) enforces 50-token threshold; extract common patterns into helpers
- Example: `extractLeftAndExprParts()` in `reassignment-parsing.ts` unifies parsing logic across three `parse*` functions
- Shared instruction sequences go to `instruction-primitives.ts`

**File Size Management**:

- 500-line limit enforced per file; if approaching, identify cohesive subset for new module
- Example: `debug-dump.ts` extracted debug interfaces from `vm.ts`, `compilation-strategies.ts` extracted 10+ try\* handlers from `app.ts`
