# Tuff Codebase Instructions for AI Coding Agents

## Project Overview

**Tuff** is a stack-based virtual machine compiler for a type-safe language with let bindings. The architecture is divided into three layers:

1. **Compiler** (`App.java`): Parses source code into instructions
2. **Instruction Pipeline**: Converts expressions to typed, precedence-aware instructions
3. **Virtual Machine** (`Vm.java`): Executes 64-bit encoded instructions with 8 registers

## Architecture

### Core Workflow: Source → Instructions → Execution

```
Source Code
    ↓
parseStatement() or parseExpressionWithRead()
    ↓
Expression parsing (handles +, -, *, /, parentheses, let bindings)
    ↓
generateInstructions() — builds the instruction list
    ↓
InstructionBuilder — converts terms to VM operations with precedence
    ↓
Vm.execute() — runs instructions on 8 registers + 1024-word memory
    ↓
Return value from register[0]
```

### Key Components

#### 1. Result<T, X> Type

- **Location**: [Result.java](../src/main/java/io/github/sirmathhman/tuff/Result.java)
- **Pattern**: Sealed interface with `Ok` and `Err` variants (Rust-style)
- **Usage**: All parsing/compilation functions return `Result<T, CompileError>` or `Result<T, ApplicationError>`
- **Critical**: Always check `.isOk()` / `.isErr()` before accessing values

#### 2. Expression Model & Parsing

- **Location**: [ExpressionModel.java](../src/main/java/io/github/sirmathhman/tuff/ExpressionModel.java), [ExpressionTokens.java](../src/main/java/io/github/sirmathhman/tuff/ExpressionTokens.java)
- **Flow**: Additive operators (±) → Multiplicative operators (\*/) → Terms (read, literals, variables)
- **Operator Precedence**: Multiplicative operators bind tighter than additive (standard math precedence)
- **Parentheses Support**: Curly braces `{}` are normalized to parentheses `()` for uniform grouping

#### 3. Let Binding Handler

- **Location**: [LetBindingHandler.java](../src/main/java/io/github/sirmathhman/tuff/LetBindingHandler.java)
- **Handles**: Type-safe variable bindings with optional type inference
- **Features**:
  - Explicit type annotations: `let x : U8 = read U8`
  - Type inference: `let x = read U16`
  - Mutable variables: `let mut x = value`
  - Uninitialized variables: `let x : I32; x = expr`
  - Chained bindings: `let x = expr1; let y = expr2; y`
- **Type Checking**: Validates type compatibility; prevents unsafe upcasting (U16→U8) and sign mismatches (signed↔unsigned)

#### 4. Instruction Builder

- **Location**: [InstructionBuilder.java](../src/main/java/io/github/sirmathhman/tuff/InstructionBuilder.java)
- **Role**: Converts parsed expressions into VM operations respecting operator precedence
- **Register Allocation**: Sequentially assigns registers to `read` operations

#### 5. Virtual Machine (VM)

- **Location**: [Vm.java](../src/main/java/io/github/sirmathhman/tuff/vm/Vm.java)
- **Architecture**:
  - 8 registers: `long[8]`
  - 1024-word memory: `long[1024]`
  - Program counter-driven execution with instruction encoding
- **Instruction Encoding** (64-bit):
  - Bits 56–63: Operation (8 bits)
  - Bits 48–55: Variant (8 bits)
  - Bits 0–23: First operand (24 bits)
  - Bits 24–47: Second operand (24 bits)
- **Variants**: `Immediate`, `DirectAddress`, `IndirectAddress` (see [Variant.java](../src/main/java/io/github/sirmathhman/tuff/vm/Variant.java))
- **Operations**: Load, Store, Add, Sub, Mul, Div, bitwise ops, jumps, logical ops, In/Out (I/O)

## Language Features

### Type System

- **Integer Types**: `U8`, `U16`, `U32`, `I8`, `I16`, `I32`
- **Implicit Upcasting**: `U8 → U16 → U32` allowed; downcasting forbidden
- **Sign Safety**: No automatic conversion between signed/unsigned
- **Pointer Types**: `*U8`, `*mut Type` (references and mutable references)

### Expression Examples

```
100U8                          // Literal U8
read U16                       // Read from input
2 * 3 + 4                      // Operators: *, /, +, - (standard precedence)
(read U8 + 100) * read U16     // Parenthesized subexpressions
let x : U8 = read U8; x + 50   // Let binding with type annotation
let y = read U16; let z = y * 2; z  // Chained let bindings
```

## Build & Test Commands

```bash
mvn test                    # Run all unit tests (AppTest.java)
mvn checkstyle:check       # Lint code (see checkstyle.xml)
mvn verify                 # Full build: compile + test + checkstyle
```

## Code Quality Constraints

- **File length**: Max 500 lines (Checkstyle)
- **Method length**: Max 50 lines (Checkstyle)
- **Testing**: All tests must pass before commits (see [AppTest.java](../src/test/java/io/github/sirmathhman/tuff/AppTest.java))
- **Test Structure**: Tests use `assertValid()` for success cases, `assertInvalid()` for error cases with timeout protection (100ms)

## Common Patterns & Conventions

### Error Handling

```java
Result<T, CompileError> result = App.compile(source);
if (result.isErr()) {
    return Result.err(result.errValue());  // Propagate error
}
T value = result.okValue();  // Use success value
```

### Adding New Operations

1. Add operation enum to [Operation.java](../src/main/java/io/github/sirmathhman/tuff/vm/Operation.java)
2. Add case in `executeInstruction()` switch in [Vm.java](../src/main/java/io/github/sirmathhman/tuff/vm/Vm.java)
3. Implement execution logic in a private `execute{OpName}()` method

### Parsing New Expression Types

- Entry point: `App.parseExpressionWithRead()` or `App.parseStatement()`
- For top-level statements: check `stmt.startsWith("let ")` first (let bindings take precedence)
- For subexpressions: integrate into `parseMultiplicative()` or `parseTerm()`
- Always return `Result<T, CompileError>` for composability

### Adding Variables

- Store in `java.util.Map<String, String>` for types (`ExpressionTokens.extractTypeFromExpression()`)
- Store in `java.util.Map<String, Integer>` for memory addresses (LetBindingHandler)
- Type validation happens in `App.determineAndValidateType()`

## Testing Guidelines

- **Location**: [AppTest.java](../src/test/java/io/github/sirmathhman/tuff/AppTest.java)
- **Test Pattern**: Use helper methods `assertValid()`, `assertValidWithInput()`, `assertInvalid()`
- **Timeout**: All tests wrapped with 100ms duration limit to catch infinite loops
- **Coverage**: Test both compile-time errors (type mismatches) and runtime behavior

## Debugging Tips

1. **Check instruction output**: `AppTest.assertValidResult()` displays compiled instructions on mismatch
2. **VM state inspection**: Add logging in [Vm.java](../src/main/java/io/github/sirmathhman/tuff/vm/Vm.java) `executeInstruction()` to trace register/memory changes
3. **Parser errors**: Look at `CompileError.display()` and propagate with context string
4. **Type conflicts**: Review `ExpressionTokens.isTypeCompatible()` for type compatibility rules
