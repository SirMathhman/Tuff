# Copilot Instructions for Tuff

## Project Overview

Tuff is a simple 64-bit virtual machine implementation in TypeScript. The codebase uses a two-layer architecture: a **compiler** (`app.ts`) that transforms source code into instructions, and a **runtime VM** (`vm.ts`) that executes those instructions with 4 registers and 1024 bytes of memory.

## Architecture

### Key Components

- **[src/vm.ts](../src/vm.ts)** - The virtual machine runtime with instruction encoding/decoding
- **[src/app.ts](../src/app.ts)** - Compiler interface and result types (TODO: implement actual compiler)

### Data Flow

1. Source code → `compile()` → `Instruction[]` (Result type)
2. Instructions → `execute()` → Exit code (number)

### Critical Patterns

**Result Type Usage**
All functions use a discriminated union for error handling:

```typescript
type Result<T, X> = Ok<T> | Err<X>;
```

Always check `result.ok` before accessing `.value` or `.error`. See [src/app.ts](../src/app.ts#L54-L60) for the pattern.

**Instruction Encoding**
Instructions are packed into 64-bit numbers using bit shifting:

- Bits 32-39: OpCode (8 bits)
- Bits 24-31: Variant (8 bits)
- Bits 12-23: Operand1 (12 bits)
- Bits 0-11: Operand2 (12 bits)

Use `encodeTo64Bits()` and `decode()` functions ([src/vm.ts](../src/vm.ts#L155-L181)) for all encoding/decoding.

**Addressing Modes**
The VM supports three variants for memory access:

- `Variant.Immediate` - Direct value
- `Variant.Direct` - Address in memory
- `Variant.Indirect` - Address stored at another address

Each instruction type (Load, Store, Jump) handles variants differently. Refer to switch cases in `execute()` for implementation patterns.

## Development Workflow

**Commands**

- `bun install` - Install dependencies
- `bun test` - Run tests (exits with code 0 on success)
- `bun run` - Run the app

**Testing Pattern**
Tests use Bun's test framework. The VM tests validate instruction encoding/decoding with boundary cases (e.g., max 12-bit values `0xfff`). App tests validate the full compile→execute pipeline via Result types. See [tests/vm.test.ts](../tests/vm.test.ts) for comprehensive examples.

## Important Implementation Details

**VM Constraints**

- Max 4 registers (indexed 0-3)
- 1024 bytes of memory
- Max 1000 instruction cycles (prevents infinite loops)
- Implicit wrapping when program counter exceeds memory bounds
- Requires explicit Halt instruction

**Compiler TODO**
The `compile()` function in [src/app.ts](../src/app.ts#L36-L39) is a stub returning empty instructions. This is the primary TODO for the project. When implementing, return `CompileError` (with `cause`, `reason`, `fix`, and optional `second` location) on failure.

**Type Safety**
TypeScript strict mode is enabled. Use the `Instruction` interface with `operand2` as optional. Always validate register/memory indices before access in switch statement cases.

## Convention

- Use Result types for all fallible operations
- Validate bounds before any memory/register access
- Halt instruction is required to exit VM (return value from Halt operand)
- When adding opcodes: update `OpCode` enum, handle all `Variant` cases in switch statement
