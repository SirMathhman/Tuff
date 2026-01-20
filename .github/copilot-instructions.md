# Tuff Codebase Instructions for AI Coding Agents

## Project Overview

**Tuff** is a stack-based virtual machine compiler for a type-safe language with let bindings. The architecture is divided into three layers:

1. **Compiler** (`App.java`): Parses source code into instructions
2. **Instruction Pipeline**: Converts expressions to typed, precedence-aware instructions
3. **Virtual Machine** (`Vm.java`): Executes 64-bit encoded instructions with 4 registers

## Architecture

### Core Workflow: Source → Instructions → Execution

```
Source Code (string)
    ↓
parseStatement() — checks for "let " binding, otherwise parseExpressionWithRead()
    ↓
Precedence-aware parsing: Additive → Multiplicative → Bitwise NOT → Terms
    ↓
ExpressionModel.ExpressionResult — terms list + read count + literal value
    ↓
generateInstructions() — creates instruction list, handles operator precedence
    ↓
InstructionBuilder.buildResultWithPrecedence() — sequences & allocates registers
    ↓
Vm.execute() — runs instructions on 4 registers + 1024-word memory
    ↓
Return value from register[0]
```

### Why This Design

- **Precedence-respecting parsing**: Expression terms preserve operator metadata (additive ops, multiplicative ops, boundaries). This allows instruction building to respect precedence without re-parsing.
- **Term-based intermediate**: `ExpressionTerm` encodes operator context (`readCount`, `additiveOp`, `multiplicativeOp`, markers) so building instructions doesn't require backtracking.
- **Marker-driven special handling**: Comparison operators, logical operators, conditionals are encoded as special `readCount` values (`-1`, `-2`, `-3`, `-4`) to signal conditional jumps and branches.

### Key Components

#### 1. Result<T, X> Type (Rust-style error handling)

- Sealed interface with `Ok` and `Err` variants
- **Pattern**: `Result<T, CompileError> result = App.compile(source); if (result.isErr()) { ... } T value = result.okValue();`
- **Critical**: All parser/compiler methods return `Result`. Always check `.isOk()` before accessing values with `.okValue()`
- **Chaining**: Use `.map()` and `.mapErr()` for composable transformations; propagate errors with `Result.err()`

#### 2. Expression Parsing Layers (Precedence-aware)

**Parsing flow** (lowest to highest precedence):

- `parseAdditive()` — splits by `+` / `-` at depth 0 (calls parseMultiplicative for each token)
- `parseMultiplicative()` — splits by `*` / `/` at depth 0 (calls BitwiseNotParser for each token)
- `BitwiseNotParser.parseTermWithNot()` — handles `~` unary operator (calls parseTerm)
- `parseTerm()` — literals, variables, `read TYPE`, parenthesized expressions, dereferences

**Why this matters**: The term list preserves operator metadata. `ExpressionTerm` stores:

- `additiveOp` — was this term subtracted? (allows reordering during building)
- `multiplicativeOp` — was this term multiplied/divided?
- Special `readCount` markers: `-1` (comparison), `-2` (logical), `-3` (if branch), `-4` (else)

#### 3. Let Binding Handler (Type-safe variable management)

**Entry points**:

- `handleLetBindingWithContinuation()` — `let x : U8 = expr; ...`
- `handleUninitializedVariable()` — `let x : I32; x = expr; ...` (requires subsequent assignment)
- Handles: type annotations, type inference, mutability, chained bindings, scoped blocks

**Type validation**:

- Implicit upcasting: `U8 → U16 → U32` allowed; `I8 → I16 → I32` allowed
- **Blocks downcasting** and **sign mismatches** (U8 → I8 rejected)
- Variables stored in `Map<String, Integer>` with memory addresses; types in `Map<String, String>`

#### 4. Instruction Builder (Precedence-respecting code generation)

**Role**: Converts term list to VM instructions while respecting precedence and handling special markers

**Key methods**:

- `buildResultWithPrecedence()` — routes to conditional/comparison/arithmetic based on markers
- `buildConditionalExpression()` — if-else via jump instructions (loads true/false branches, uses register[0])
- `buildComparisonExpression()` — comparison operators become Load + comparison op + conditional jumps
- `loadAllReads()` — first pass: issues `In` (input) instructions to registers in order

**Register allocation**:

- Registers: 0 (result), 1–3 (scratch/branches), rest for temporary operands
- `read` operations assigned sequentially: `read U8` → reg[0], next `read` → reg[1], etc.

#### 5. Virtual Machine (4 registers, 1024-word memory)

**Execution model**:

- 4 registers: `long[4]` (0=result, 1–3=scratch)
- 1024-word memory: `long[1024]` (variable storage + instruction space)
- Program counter increments each cycle (unless Jump instruction sets it)

**64-bit instruction encoding**:

- Bits 56–63: `Operation` enum (8 bits)
- Bits 48–55: `Variant` enum (8 bits)
- Bits 0–23: First operand (24 bits, sign-extended)
- Bits 24–47: Second operand (24 bits, sign-extended)

**Operations** (see `Operation.java`): Load, Store, Add, Sub, Mul, Div, BitsShiftLeft/Right, BitsAnd/Or/Xor, BitsNot, In, Out, Jump, JumpIfLessThanZero, Equal, LessThan, GreaterThan, LogicalAnd, LogicalOr, LogicalNot, Halt

## Language Features

### Type System

- **Integer Types**: `U8`, `U16`, `U32`, `I8`, `I16`, `I32`, `Bool`
- **Implicit Upcasting Only**: `U8 → U16 → U32` and `I8 → I16 → I32` allowed; **no downcasting, no sign mixing**
- **Type Inference**: `let x = read U16;` infers type `U16`
- **Pointer Types**: `*U8`, `*mut Type` (memory references with mutable variant)

### Operator Precedence (lowest to highest)

1. Logical OR: `||` (lowest precedence, short-circuit jumps)
2. Logical AND: `&&` (short-circuit jumps)
3. Comparison: `==`, `!=`, `<`, `>`, `<=`, `>=`
4. Bitwise: `|`, `^`, `&`
5. Shift: `<<`, `>>`
6. Additive: `+`, `-`
7. Multiplicative: `*`, `/` (highest precedence)
8. Unary: `~`, `*` (dereference)

### Conditional Expressions

- **Syntax**: `if (condition) trueBranch else falseBranch`
- **Condition** must be `Bool` type (comparison result or explicit `read Bool`)
- **Branches** are expressions (can be nested, literals, or let bindings)
- **Compilation**: Branches generate jump instructions; condition sets register[0] to control flow

## Refactoring & Code Organization Patterns

### Registry Threading Pattern (Struct Definitions)

When structs are defined, they must be tracked and available during field access parsing. The `Map<String, StructDefinition> structRegistry` is threaded through:

```
App.parseStatement() 
  → LetBindingHandler.handleLetBindingStatement(structRegistry)
    → LetBindingProcessor.process(..., structRegistry)
      → StructInstantiationHandler.parseStructInstantiation(..., structRegistry)
      → LetBindingProcessor.handleStructFieldAccess(..., structRegistry)
```

**Pattern**: Optional parameter throughout chain (default empty map if not available). Registry enables validation of struct names and field existence at compile time.

### Multi-Field Struct Access Pattern

When struct variables are used in expressions with multiple field accesses (e.g., `point.x + point.y`), the entire continuation must be substituted before parsing:

1. **Extract all field names** using regex: `Pattern.compile("\\b" + varName + "\\.([a-zA-Z_][a-zA-Z0-9_]*)\\b")`
2. **Validate field existence** against `StructInstantiationResult.fieldValues()`
3. **Replace all occurrences** with parenthesized values: `point.x` → `(read U8)`, `point.y` → `(read U8)`
4. **Parse substituted expression** as a single unit: `(read U8) + (read U8)`

This ensures operators between field accesses are parsed correctly with proper precedence.

**File**: `letbinding/LetBindingProcessor.handleStructFieldAccess()`

### Processor Pattern (For Large Handlers)

When a handler class exceeds ~400 lines or contains methods approaching 50-line limits, extract processing logic into a dedicated `*Processor` class in a subpackage:

```java
// LetBindingHandler.java (now ~300 lines, cleaner)
public static Result<Void, CompileError> handleLetBindingWithContinuation(...) {
    return LetBindingProcessor.process(stmt, equalsIndex, semiIndex, ...);
}

// letbinding/LetBindingProcessor.java (new, ~150 lines)
public static Result<Void, CompileError> process(...) {
    // Complex logic extracted here
}
```

**Benefits**: Spreads responsibility, keeps file sizes <500 lines, methods <50 lines, maintains cohesion.

### Supporting Record Types

Use small record types (in same package as processor) to encapsulate parsing results:

```java
// letbinding/VariableDecl.java
public record VariableDecl(String varName, boolean isMutable, String valueExpr) { }

// Usage in LetBindingProcessor.java
VariableDecl decl = parseVariableDecl(stmt, equalsIndex, semiIndex);
String varName = decl.varName();  // Access via record getter
```

## Recently Implemented Features (Reference)

### Struct Definitions with Field Support

- **Handler**: `StructHandler` + `StructDefinition` record
- **Pattern**: `struct Point { x : U8, y : U8 }` defines a named struct with typed fields
- **Registration**: Struct definitions stored in `Map<String, StructDefinition>` and threaded through parsing chain
- **Key Classes**: `StructDefinition`, `StructHandler.StructField`, `StructInstantiationHandler`
- **Files**: `letbinding/StructHandler.java`, `letbinding/StructDefinition.java`, `letbinding/StructInstantiationHandler.java`

### Struct Variable Binding and Field Access

- **Handler**: `StructInstantiationHandler` with registry-aware parsing
- **Pattern**: `let point : Point = Point { x : read U8, y : read U8 }; point.x + point.y`
- **Type Annotation**: Variables parse type declarations: `let name : Type = expr`
- **Field Access**: Multi-field support via regex replacement of all field occurrences
- **Implementation**: `LetBindingProcessor.handleStructFieldAccess()` replaces all `varName.fieldName` with field values, then parses substituted expression
- **Files**: `letbinding/LetBindingProcessor.java`, `letbinding/VariableDecl.java`

### Match Expressions (Pattern Matching)

- **Handler**: `MatchExpressionHandler`
- **Pattern**: `match (scrutinee) { case pattern => value; ... case _ => default; }`
- **Conversion**: Transforms match to nested if-else conditionals automatically
- **Supported Patterns**: Literal values and wildcard (`_`) for default case
- **Implementation**: Converts case arms to conditional branches with equality comparisons
- **File**: `letbinding/MatchExpressionHandler.java`

### For Loops (Range-based Iteration)

- **Handler**: `ForLoopHandler` + `ForLoopProcessor`
- **Pattern**: `for (i = start; i < end; i = i + 1) { body }`
- **Implementation**: Sets up loop counter variable, generates condition comparison, manages loop jump-back
- **Semantics**: Loop variable automatically incremented; body can reference and use counter
- **Limitations**: Condition must be `<` comparison; increment pattern must match exactly
- **Files**: `letbinding/ForLoopHandler.java`, `letbinding/ForLoopProcessor.java`

### Compound Assignment Operators (+=, -=, \*=, /=)

- **Handler**: `CompoundAssignmentHandler` + `MutableAssignmentHandler` (orchestrator)
- **Pattern**: Mutable variable + compound operator → Load var, Eval expr, Apply op, Store result
- **Key Detail**: `AssignmentParseResult` record includes `compoundOp` field (null for simple assign)
- **Files**: `LetBindingHandler.handleMutableVariableWithAssignment()`, `CompoundAssignmentHandler`, `MutableAssignmentHandler`

### While Loops

- **Handler**: `WhileLoopHandler` (dedicated, ~375 lines)
- **Pattern**: Parses `while (cond) { body }`, generates condition evaluation → conditional jump → body loop → jump back
- **Key Detail**: Condition stored in variable, loop uses memory-based variable state
- **Limitation**: Body requires assignment (e.g., `x = x + 1`); only supports mutable variable updates
- **File**: `WhileLoopHandler.java`

### Yield Expressions in Scoped Blocks

- **Pattern**: `{ stmt1; stmt2; yield expr; }` syntax for block-level return value
- **Handler**: `LetBindingHandler.handleYieldBlock()`
- **Semantics**: Executes statements before yield, then yields final expression as block result
- **File**: `LetBindingHandler.java`

## Common Patterns & Conventions

### Error Handling Pattern

```java
Result<T, CompileError> result = App.compile(source);
if (result.isErr()) {
    return Result.err(result.errValue());  // Propagate error
}
T value = result.okValue();  // Use success value
```

### Parsing New Expression Types

1. **For operators**: Add case to one of the splitting methods (`splitAddOperators()`, `splitMultOperators()`, etc. in ExpressionTokens)
2. **For handler classes**: Each operator gets a dedicated `*Handler.java` (e.g., `EqualityOperatorHandler`, `LogicalAndHandler`)
3. **Handler pattern**: Static method that takes expression string, returns `Result<ExpressionModel.ExpressionResult, CompileError>`
4. **Integration**: Call handler from appropriate parsing layer before returning to caller

### Adding New Operations to VM

1. Add operation enum to `Operation.java`
2. Add case in `executeInstruction()` switch in `Vm.java`
3. Implement as private `execute{OpName}()` method returning boolean (true = jump, false = increment PC)
4. For arithmetic: operate on registers in-place (e.g., `registers[op1] += registers[op2]`)
5. For jumps: return true to signal PC update

### Package Structure (Max 15 classes per package)

- `io.github.sirmathhman.tuff` (7 classes) — Core types: `App`, `Result`, `Error` types
- `io.github.sirmathhman.tuff.compiler` (12 classes) — Parsing: `ExpressionModel`, handlers, builders
- `io.github.sirmathhman.tuff.vm` (4 classes) — VM: `Vm`, `Instruction`, `Operation`, `Variant`

Enforced by pre-commit hook (`check_package_class_limit.py`). If adding a class: verify `python check_package_class_limit.py` passes.

## Build & Test

```bash
mvn test                    # Run all unit tests (~1.5s)
mvn checkstyle:check       # Lint code (500 line file max, 50 line method max)
mvn verify                 # Full build: compile → test → checkstyle
python check_package_class_limit.py  # Manual package check
```

**Pre-commit Hooks**: Tests + checkstyle + package limit must pass before commits. Use `mvn verify` locally before pushing.

## Testing Guidelines

- **Location**: `AppTest.java`
- **Helpers**: `assertValid(source, exitCode)`, `assertValidWithInput(source, exitCode, inputs...)`, `assertInvalid(source)`
- **Timeout**: 100ms per test to catch infinite loops (wrapped with `Assertions.assertTimeoutPreemptively`)
- **Coverage**: Both compile-time errors (type mismatches) and runtime behavior
- **Instruction debugging**: On test failure, instruction list is displayed for inspection

## Debugging Tips

1. **Instruction inspection**: Run failing test; error message includes full compiled instruction list
2. **Type system**: Review `ExpressionTokens.isTypeCompatible()` for upcasting/downcasting rules
3. **Parser tracing**: Check `CompileError.display()` output; add error context with `new CompileError("prefix: " + existing)`
4. **VM execution**: Add println in `executeInstruction()` to trace register/memory state across cycles
5. **Scoped blocks**: Let bindings with `{ expr }` syntax create local variable scope; verify variable shadowing doesn't leak
