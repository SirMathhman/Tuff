# Copilot Instructions for Tuff

## Project Overview

Tuff is a 64-bit virtual machine with an arithmetic expression compiler in TypeScript. The architecture separates concerns: [src/parser.ts](../src/parser.ts) and [src/app.ts](../src/app.ts) handle compilation of typed expressions (with validation), while [src/vm.ts](../src/vm.ts) executes instructions on a 4-register, 1024-byte memory VM. [src/types.ts](../src/types.ts) defines error handling and type constraints.

## Core Architecture

**Data Flow**: Source code → parse/validate → compile to `Instruction[]` → encode to memory → execute

**Three Layers**:

1. **Parser** ([src/parser.ts](../src/parser.ts)) - Recursive descent for arithmetic expressions: precedence-aware (add/sub at top, mul/div higher), parentheses support, `read U8` I/O
2. **Compiler** ([src/app.ts](../src/app.ts)) - Orchestrates parsing, type checking, generates instruction sequences using memory slots 900-903 for temp storage
3. **VM** ([src/vm.ts](../src/vm.ts)) - Executes 64-bit encoded instructions with register/memory operations, max 1000 cycles

## Critical Patterns

**Result Type Error Handling**
All fallible operations return `Result<T, X> = Ok<T> | Err<X>`. Always branch on `result.ok`:

```typescript
const result = compile(source);
if (result.ok) {
  /* use result.value */
} else {
  /* use result.error */
}
```

**Instruction Encoding** (64-bit layout)

- Bits 32-39: OpCode | Bits 24-31: Variant | Bits 12-23: Operand1 | Bits 0-11: Operand2
- Use `encodeTo64Bits()` and `decode()` - never manual bit operations
- Sign-extension handles negative immediates in Load instructions automatically

**Three Addressing Variants**

- `Immediate`: operand is constant value
- `Direct`: operand is memory address
- `Indirect`: operand points to address containing target address

Each opcode handles variants differently in switch cases.

**Compiler Memory Layout**
Reserved slots for temp values (compiler state management):

- 900: Main computation result storage
- 901: Operand staging area
- 902: Multiply/divide result location
- 903: Temporary read values

Parse functions return `Instruction[]` ending with `Halt` (top-level) or omitting it (sub-expressions that chain).

**Type System with Suffixes**
Supported: `U8`, `U16`, `I8`, `I16` (unsigned/signed, bits). Parser extracts suffix via `findTypeSuffixIndex()`. Validation in [src/types.ts](../src/types.ts): `checkTypeOverflow()` and `checkNegativeUnsignedError()` prevent illegal combinations.

## Common Compiler Patterns

**Building Instruction Sequences**
Sub-expression parsers (e.g., `parseAddExpression()`) build arrays by:

1. Left operand → instructions (value in register)
2. Right operand → instructions (value in another register)
3. Operation instruction + store result to shared memory
4. Top-level adds Halt pointing to result slot

**Chained Operations**
Addition chains (`a + b + c`) parse recursively: left computes and stores to memory[900], right recursively parses remaining expression to memory[902], final Add combines both. See `buildChainedReadAddExpression()`.

**Read Statements**
`read U8` → In (stdin→r0) → Store to memory → Load if needed. Multiple reads use different temp slots to avoid clobbering.

## Development Workflow

**Commands**: `bun install`, `bun test`, `bun run`

**Precommit Gates** (via Husky)
Commits trigger the precommit hook which runs in sequence:

1. `bun test --coverage` - All tests must pass with coverage reporting; blocks commit if failures occur
2. `bun run lint:fix` - ESLint (TypeScript config) auto-fixes violations; commit proceeds if fixable, fails if unfixable issues remain
3. `bun run format` - Prettier reformats all files for consistency
4. `bun run cpd` - PMD copy-paste detector flags duplicated token sequences (≥50 tokens); informational but doesn't block

**Avoid precommit failures**: Run locally before pushing with `bun test && bun run lint:fix && bun run format` to catch issues early.

**Linting Rules** (via ESLint + TypeScript)
The [eslint.config.mjs](../eslint.config.mjs) enforces strict code quality:

**Prohibited Patterns**:

- Regular expressions: Use `findTypeSuffixIndex()`, `findOperatorIndex()` string iteration patterns instead (char-by-char parsing required)
- RegExp constructor calls: No dynamic regex creation
- `max-lines-per-function: 50` - Functions must be concise; split complex logic into helpers (e.g., `parseAtom()`, `parseLeftForSub()`)
- `max-depth: 2` - Nesting limited to 2 levels; refactor deep nesting into separate functions
- `max-lines: 500` - Files capped at 500 lines; split if approaching limit; Don't remove whitespace or comments, whitespace and comments are ignored

**TypeScript Config** ([tsconfig.json](../tsconfig.json))

- `strict: true` - Enables all strict type checks
- `noFallthroughCasesInSwitch: true` - All switch cases must have breaks or exhaustive handling
- `noUncheckedIndexedAccess: true` - Array/object access returns `T | undefined`; must check before use
- `noImplicitOverride: true` - Override methods must explicitly mark `override` keyword
- `skipLibCheck: true` - Skip type checking of .d.ts files

**Testing Conventions**

- VM tests ([tests/vm.test.ts](../tests/vm.test.ts)): encode/decode round-trip, boundary cases (12-bit limits)
- App tests ([tests/app.test.ts](../tests/app.test.ts)): end-to-end via `assertValid(source, expectedExit, ...stdIn)` and `assertInvalid(source)` for error paths
- Test invalid cases: negative unsigned (`-100U8`), overflow (`256U8`)

## Implementation Notes

- **4 registers** (r0-r3), **1024 bytes** memory, **1000 cycle** limit
- **Program counter wraps** at memory boundary
- **Halt required** to exit (return value from Halt's operand)
- **Validate** operand indices before register/memory access
- **Sign-extend** 12-bit immediates for negative constants
