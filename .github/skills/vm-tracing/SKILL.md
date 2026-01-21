---
name: vm-tracing
description: "VM tracing enables observation of virtual machine execution state at each cycle. Use when debugging instruction sequences, register behavior, memory state, and program flow. Keywords: debugging, VM, tracing, execution trace, register state, memory inspection, instruction flow."
---

# Virtual Machine Tracing Guide

## Overview

VM tracing is a debugging feature that captures detailed execution state at every instruction cycle. It allows you to observe register values, memory changes, program flow, and stack state as the virtual machine executes compiled code. This skill teaches how to enable tracing, interpret trace output, and use it to diagnose execution issues.

## When to Use VM Tracing

- **Instruction sequence debugging**: Verify compiled instructions execute in correct order
- **Register behavior analysis**: Track how values move between registers across cycles
- **Memory inspection**: Monitor memory writes and reads at specific addresses
- **Stack management debugging**: Observe call stack operations for function calls
- **Program flow verification**: Confirm jumps and branches occur at expected points
- **Unexpected results diagnosis**: Trace backwards from wrong output to find root cause
- **Complex recursion debugging**: Track register allocation and frame management in recursive calls

## VM Architecture Overview

### Registers
The Tuff VM has **4 registers** (64-bit):
- `registers[0]`: Result register (holds return value, used in comparisons and accumulation)
- `registers[1]`: Scratch register
- `registers[2]`: Scratch register
- `registers[3]`: Scratch register

### Memory
- **1024 words** total (64-bit each)
- Words 0–499: Available for general use
- **Word 500**: Stack pointer (typically used as frame pointer for function calls)
- Words 501–1023: Available for stack and data

### Program Counter (PC)
- Points to the current instruction in memory
- Increments by 1 after each instruction (unless Jump instruction changes it)

### Instruction Format
```
64-bit layout:
[Bits 56–63: Operation]
[Bits 48–55: Variant]
[Bits 0–23: First Operand (24-bit, sign-extended)]
[Bits 24–47: Second Operand (24-bit, sign-extended)]
```

## Enabling Tracing

### Basic Tracing: Standard Stack Debug

Use this preset to trace with default settings suitable for function debugging:

```java
Vm.TraceConfig traceConfig = Vm.TraceConfig.standardStackDebug();

// Example: execute with tracing
Instruction[] instructions = InstructionBuilder.build(...);
int result = Vm.execute(
    instructions,
    read,           // IntSupplier for input
    write,          // IntConsumer for output
    traceConfig,
    traceCycle -> {
        // Trace sink: called after each cycle
        System.out.println(formatTraceCycle(traceCycle));
    }
);
```

**Default settings**:
- `maxCycles`: 0 (unlimited)
- `watchAddresses`: [500, 501, 502] (stack pointer area)
- `spAddress`: 500 (stack pointer location)
- `stackWindowSize`: 16 (show 16 words of stack)

### Custom Tracing Configuration

For more control, create a custom `TraceConfig`:

```java
Vm.TraceConfig customConfig = new Vm.TraceConfig(
    maxCycles,           // long: maximum cycles before error (-1 or 0 for unlimited)
    watchAddresses,      // int[]: memory addresses to watch
    spAddress,           // int: stack pointer address (-1 to disable stack tracing)
    stackWindowSize      // int: number of words to show around stack pointer
);

// Example: limit to 1000 cycles, watch registers 0-3 results, and memory addresses 100, 200
Vm.TraceConfig config = new Vm.TraceConfig(
    1000,
    new int[] { 100, 200 },
    -1,     // Disable stack tracing
    0
);
```

### No Tracing (Production)

For production code or performance-critical testing:

```java
int result = Vm.execute(instructions, read, write);  // No tracing
// OR
int result = Vm.execute(
    instructions,
    read,
    write,
    Vm.TraceConfig.disabled(),  // Explicitly disabled
    null
);
```

## Understanding Trace Output

Each trace cycle contains:
- **Cycle number**: Which instruction is being executed
- **Program Counter (PC)**: Current instruction address in memory
- **Instruction**: Operation, variant, and operands
- **Machine state before**: Register values and memory state
- **Flow decision**: Whether instruction jumps and where PC goes next

### Trace Cycle Records

```java
record TraceCycle(
    long cycle,                      // Cycle number (0, 1, 2, ...)
    int programCounter,              // Current PC
    TraceInstruction instruction,    // What's being executed
    TraceMachine machine,            // State of registers and memory
    TraceFlow flow                   // Jump decision and next PC
);

record TraceInstruction(
    long encodedInstruction,         // Raw 64-bit instruction
    Operation op,                    // Operation enum (Add, Load, Jump, etc.)
    Variant variant,                 // Variant (e.g., I32, U8, etc.)
    long firstOperand,               // First 24-bit operand (sign-extended)
    long secondOperand               // Second 24-bit operand (sign-extended)
);

record TraceMachine(
    long[] registers,                // 4-element array: reg[0-3] values
    int spValue,                     // Stack pointer value (from spAddress)
    long[] stackValues,              // Memory window around SP
    long[] watchValues               // Values at watched memory addresses
);

record TraceFlow(
    boolean shouldJump,              // Did this instruction cause a jump?
    int nextProgramCounter           // Next PC value
);
```

## Practical Tracing Workflows

### Workflow 1: Trace Simple Arithmetic

**Goal**: Verify a basic addition operation compiles and executes correctly.

```java
String source = """
    read I32 + 5
""";

Result<Instruction[], CompileError> result = App.compile(source);
if (result.isErr()) {
    System.out.println("Compile error: " + result.errValue().display());
    return;
}

Instruction[] instructions = result.okValue();
Vm.TraceConfig config = Vm.TraceConfig.standardStackDebug();

int output = Vm.execute(
    instructions,
    () -> 10,  // Input: 10
    System.out::println,
    config,
    cycle -> {
        System.out.printf(
            "Cycle %d: PC=%d | Op=%s Var=%s | Reg[0]=%d | Next PC=%d%n",
            cycle.cycle(),
            cycle.programCounter(),
            cycle.instruction().op(),
            cycle.instruction().variant(),
            cycle.machine().registers()[0],
            cycle.flow().nextProgramCounter()
        );
    }
);

System.out.println("Result: " + output);  // Expected: 15
```

### Workflow 2: Debug Conditional Jump

**Goal**: Verify an if-else expression executes the correct branch.

```java
String source = """
    if (read I32 > 5) 100 else 200
""";

Result<Instruction[], CompileError> result = App.compile(source);
Instruction[] instructions = result.okValue();

// Test case 1: Input = 10 (should take true branch)
System.out.println("=== Test: input 10 (> 5, should be 100) ===");
int output1 = Vm.execute(
    instructions,
    () -> 10,
    System.out::println,
    Vm.TraceConfig.standardStackDebug(),
    cycle -> {
        // Print only jumps and loads
        if (cycle.flow().shouldJump() ||
            cycle.instruction().op() == Operation.Jump) {
            System.out.printf(
                "Cycle %d: PC=%d | Op=%s | Jump=%s | Next PC=%d%n",
                cycle.cycle(),
                cycle.programCounter(),
                cycle.instruction().op(),
                cycle.flow().shouldJump(),
                cycle.flow().nextProgramCounter()
            );
        }
    }
);
System.out.println("Output: " + output1);

// Test case 2: Input = 3 (should take false branch)
System.out.println("\n=== Test: input 3 (< 5, should be 200) ===");
int output2 = Vm.execute(
    instructions,
    () -> 3,
    System.out::println,
    Vm.TraceConfig.standardStackDebug(),
    cycle -> {
        if (cycle.flow().shouldJump() ||
            cycle.instruction().op() == Operation.Jump) {
            System.out.printf(
                "Cycle %d: PC=%d | Op=%s | Jump=%s | Next PC=%d%n",
                cycle.cycle(),
                cycle.programCounter(),
                cycle.instruction().op(),
                cycle.flow().shouldJump(),
                cycle.flow().nextProgramCounter()
            );
        }
    }
);
System.out.println("Output: " + output2);
```

### Workflow 3: Monitor Stack Operations

**Goal**: Trace function calls and observe stack pointer changes.

```java
String source = """
    fn add(a : I32) => a + 10;
    add(5)
""";

Instruction[] instructions = App.compile(source).okValue();

// Watch the stack area closely
Vm.TraceConfig stackConfig = new Vm.TraceConfig(
    0,                      // Unlimited cycles
    new int[] { 500 },      // Watch stack pointer
    500,                    // Stack pointer at address 500
    20                      // Show 20 words of stack
);

int result = Vm.execute(
    instructions,
    () -> 0,
    System.out::println,
    stackConfig,
    cycle -> {
        // Print state only when stack pointer changes
        TraceMachine machine = cycle.machine();
        if (machine.spValue() != 500) {
            System.out.printf(
                "Cycle %d: SP=%d | Op=%s | Stack=%s%n",
                cycle.cycle(),
                machine.spValue(),
                cycle.instruction().op(),
                Arrays.toString(machine.stackValues())
            );
        }
    }
);

System.out.println("Result: " + result);
```

### Workflow 4: Diagnose Infinite Loop

**Goal**: Set a cycle limit to catch infinite loops and find where they occur.

```java
String source = """
    let x : I32 = 0;
    while (x < 100) {
        x = x + 1;
    }
    x
""";

Instruction[] instructions = App.compile(source).okValue();

// Limit to 500 cycles to detect infinite loops
Vm.TraceConfig limitedConfig = new Vm.TraceConfig(
    500,                    // Maximum 500 cycles
    new int[0],             // No watched addresses
    -1,                     // No stack tracing
    0
);

try {
    int result = Vm.execute(
        instructions,
        () -> 0,
        System.out::println,
        limitedConfig,
        cycle -> {
            // Print every 50 cycles to see progress
            if (cycle.cycle() % 50 == 0) {
                System.out.printf(
                    "Cycle %d: PC=%d | Op=%s | Reg[0]=%d%n",
                    cycle.cycle(),
                    cycle.programCounter(),
                    cycle.instruction().op(),
                    cycle.machine().registers()[0]
                );
            }
        }
    );
} catch (IllegalStateException e) {
    if (e.getMessage().contains("Cycle limit exceeded")) {
        System.out.println("ERROR: Program exceeded cycle limit (likely infinite loop)");
        System.out.println(e.getMessage());
    }
}
```

### Workflow 5: Trace Register Usage in Recursion

**Goal**: Verify recursive function uses registers correctly.

```java
String source = """
    fn factorial(n : I32) =>
        if (n <= 1) 1 else n * factorial(n - 1)
""";

Instruction[] instructions = App.compile(source).okValue();

// Watch all 4 registers closely
Vm.TraceConfig regConfig = new Vm.TraceConfig(
    0,
    new int[] { 0, 1, 2, 3 },  // Watch register stack frames
    500,
    16
);

int result = Vm.execute(
    instructions,
    () -> 5,
    System.out::println,
    regConfig,
    cycle -> {
        long[] regs = cycle.machine().registers();
        // Print state when result register changes
        if (regs[0] != 0) {
            System.out.printf(
                "Cycle %d: PC=%d | Op=%s | Reg[0]=%d Reg[1]=%d Reg[2]=%d Reg[3]=%d%n",
                cycle.cycle(),
                cycle.programCounter(),
                cycle.instruction().op(),
                regs[0], regs[1], regs[2], regs[3]
            );
        }
    }
);

System.out.println("Result: " + result);  // Expected: 120 (5!)
```

## Interpreting Trace Data

### Reading Register Values

Registers can hold 64-bit signed integers:

```
Reg[0] = 10           // Positive value
Reg[1] = -5           // Negative value
Reg[2] = 0            // Zero (often unused)
Reg[3] = 1024         // Large value
```

**Key insight**: Reg[0] is the main result register—watch this to see computed values.

### Detecting Jump Behavior

When `flow.shouldJump() == true`:
- Instruction caused a branch decision
- PC jumps to `flow.nextProgramCounter()` instead of incrementing
- Look for `Operation.Jump`, `JumpIfLessThanZero`, `LogicalAnd`, `LogicalOr`

```
Cycle 15: Op=LessThan, Jump=true, Next PC=42
  → Comparison was true; next instruction is at PC 42 (branch taken)

Cycle 16: Op=LessThan, Jump=false, Next PC=27
  → Comparison was false; continue to next instruction (PC 27)
```

### Monitoring Stack Pointer

When tracing with stack support (`spAddress=500`):

```
SP = 500   → Stack is empty (at base)
SP = 520   → Stack has grown by 20 words (may indicate function call)
SP = 500   → Stack returned to base (function returned)
```

### Memory Watch Values

If you specify `watchAddresses`:

```java
Vm.TraceConfig config = new Vm.TraceConfig(
    0,
    new int[] { 100, 200, 300 },  // Watch these addresses
    -1,
    0
);

// Trace output includes:
// machine.watchValues()[0]  → Value at address 100
// machine.watchValues()[1]  → Value at address 200
// machine.watchValues()[2]  → Value at address 300
```

## Common Debugging Patterns

### Pattern 1: "Wrong result produced"

**Debug steps**:
1. Trace the program with input that produces wrong result
2. Print `cycle.machine().registers()[0]` each cycle
3. Find where reg[0] diverges from expected value
4. Check instructions leading to that point
5. Verify operands and operation type

**Example**:
```
Cycle 10: Reg[0]=5 (expected)
Cycle 11: Op=Add, Reg[0]=5 (should be 15!)
  → Add operation didn't execute; check operands and variant
```

### Pattern 2: "Program doesn't halt"

**Debug steps**:
1. Set a `maxCycles` limit (e.g., 10000)
2. Run program; let it hit cycle limit
3. Examine trace where it stops
4. Look for PC jumping to same location repeatedly
5. Check loop condition or recursion termination

**Example**:
```
Cycle 9990: PC=42, Op=Jump, Next PC=35
Cycle 9991: PC=35, Op=LessThan, Next PC=42
  → Loop between PC 35 and 42 (infinite loop)
```

### Pattern 3: "Stack corruption"

**Debug steps**:
1. Enable stack tracing with `spAddress=500`
2. Watch `machine.stackValues()` each cycle
3. Look for unexpected memory changes
4. Compare with expected frame layouts

**Example**:
```
Cycle 50: SP=510, Stack=[100, 200, 300, ...]
Cycle 51: SP=510, Stack=[100, 999, 300, ...]  ← Unexpected!
  → Instruction at Cycle 50 wrote to wrong stack location
```

## Advanced Techniques

### Selective Tracing (Only Interesting Cycles)

Reduce output by only printing certain cycles:

```java
final int[] lastRegValue = { 0 };

int result = Vm.execute(
    instructions,
    () -> 0,
    System.out::println,
    config,
    cycle -> {
        long currentReg0 = cycle.machine().registers()[0];

        // Only print when reg[0] changes
        if (currentReg0 != lastRegValue[0]) {
            System.out.printf(
                "Cycle %d: Op=%s, Reg[0]: %d → %d%n",
                cycle.cycle(),
                cycle.instruction().op(),
                lastRegValue[0],
                currentReg0
            );
            lastRegValue[0] = (int) currentReg0;
        }
    }
);
```

### Detailed Instruction Analysis

Print full instruction details:

```java
cycle -> {
    TraceInstruction instr = cycle.instruction();
    System.out.printf(
        "Cycle %d: Op=%s Variant=%s Op1=%d Op2=%d%n",
        cycle.cycle(),
        instr.op(),
        instr.variant(),
        instr.firstOperand(),
        instr.secondOperand()
    );
}
```

### Jump Trace Map

Build a map of where jumps occur:

```java
Map<Integer, Integer> jumpMap = new HashMap<>();

int result = Vm.execute(
    instructions,
    input,
    output,
    config,
    cycle -> {
        if (cycle.flow().shouldJump()) {
            jumpMap.put(
                cycle.programCounter(),
                cycle.flow().nextProgramCounter()
            );
        }
    }
);

System.out.println("Jump map:");
jumpMap.forEach((from, to) ->
    System.out.printf("PC %d → PC %d%n", from, to)
);
```

## Best Practices for VM Tracing

1. **Start with `standardStackDebug()`**: Most issues involve register or stack state
2. **Use selective printing**: Print only relevant cycles to keep output manageable
3. **Watch specific memory addresses**: Narrow focus to debug-relevant regions
4. **Compare test cases**: Run same code with different inputs and compare traces
5. **Follow register[0]**: Result register is usually where you'll find the issue
6. **Check cycle counts**: Unexpected cycle counts indicate missed jumps or extra instructions
7. **Document trace output**: Add comments explaining what you expect to see
8. **Disable tracing for tests**: Only enable when debugging; tracing adds overhead

## Integration with Testing

Enable tracing only when tests fail:

```java
@Test
public void testComplexRecursion() {
    String source = "fn sum(n : I32) => if (n <= 0) 0 else n + sum(n - 1)";

    Result<Instruction[], CompileError> result = App.compile(source);
    if (result.isErr()) {
        fail("Compile error: " + result.errValue().display());
    }

    Instruction[] instructions = result.okValue();

    // Only trace if enabled (e.g., via system property or test profile)
    Vm.TraceConfig config = Boolean.getBoolean("enableVmTrace")
        ? Vm.TraceConfig.standardStackDebug()
        : Vm.TraceConfig.disabled();

    int result_value = Vm.execute(
        instructions,
        () -> 5,
        System.out::println,
        config,
        config == Vm.TraceConfig.disabled() ? null : cycle -> {
            System.out.println(cycle);
        }
    );

    assertEquals(15, result_value);
}
```

Run with tracing:
```bash
mvn test -DenableVmTrace=true
```