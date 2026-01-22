# Tuff - 64-bit Virtual Machine & Compiler

A compiler and virtual machine for a typed expression language, supporting arithmetic, variables with type checking, mutable references, pointers, if-expressions, comparisons, arrays, and compound assignments.

## Installation

```bash
bun install
```

## Development

```bash
# Run tests
bun test

# Run linter
bun run lint:fix

# Format code
bun run format

# Check for circular dependencies
bun x madge --circular src

# Visualize dependency graph
bun run visualize
```

## Language Features

### Basic Expressions

```
100          # Halt with exit code 100
read U8      # Read 8-bit unsigned integer from stdin
1U8 + 2U8    # Arithmetic: addition (also -, *, /)
(5 + 3) / 2  # Grouping with parentheses
```

### Variables & Type System

```
let x : U8 = read U8;           # Variable with type annotation
let y = 42I32;                  # Type inferred from literal (42I32 = 42 as I32)
let mut z : U16 = 100U16;       # Mutable variable for reassignment
z = 200U16;                      # Reassignment only allowed with 'let mut'
```

### Compound Assignment Operators

```
let mut x = 10I32;
x += 5I32;                       # Equivalent to: x = x + 5I32
x -= 3I32;                       # Equivalent to: x = x - 3I32
x *= 2I32;                       # Equivalent to: x = x * 2I32
x /= 4I32;                       # Equivalent to: x = x / 4I32

# Compound operators support all operand types:
x += read I32;                   # Read expression
x += y;                          # Variable reference
x += 2I32 + 3I32;                # Arithmetic expression
```

### Pointers & References

```
let mut x = 5I32;
let y : *mut I32 = &mut x;      # Mutable pointer (can write through)
*y = 10I32;                       # Write through pointer
let z = &x;                       # Immutable reference (auto-typed)
*z + *y                           # Dereference to read values
```

### If-Expressions

```
if (read U8 == 5U8) 100U32 else 200U32
if (true) read I32 else read I32
```

### Arrays & Slices

```
let array = [1I32, 2I32, 3I32];  # Array literal with inferred type
let arr : [U8; 2; 4] = [10U8, 20U8];  # 2 initialized, 4 total capacity

array[0]                          # Array indexing
array[read U8]                    # Dynamic index from stdin

let mut mutable_arr = [1U8, 2U8];
mutable_arr[0] = 99U8;            # Element assignment (requires 'let mut')

let slice : *[I32] = &array;     # Create slice (reference to array)
slice.initialized                 # Access slice metadata (count of initialized elements)
slice.capacity                    # Total capacity of underlying array
```

## Type System

Supported types:

- **Unsigned integers**: `U8` (0-255), `U16` (0-65535)
- **Signed integers**: `I8` (-128 to 127), `I16` (-32768 to 32767)
- **Booleans**: `Bool` (true/false, 0/1)
- **Pointers**: `*Type`, `*mut Type` for mutable references
- **Slices**: `*[ElementType]` for array references
- **Arrays**: `[ElementType; InitializedLen; TotalCapacity]`

Type compatibility allows safe widening (U8→U16, I8→I16) but rejects narrowing.

## Architecture

- **Parser** (`src/parser.ts`): Tokenization and syntax extraction
- **Arithmetic Parser** (`src/arithmetic-parsing.ts`): Recursive descent for operators with precedence
- **Let Bindings** (`src/let-binding.ts`): Variable context and type inference
- **Compilation Strategies** (`src/compilation-strategies.ts`): Pattern-based compilation handlers
- **Virtual Machine** (`src/vm.ts`): 64-bit instruction execution, 4 registers, 1024-byte memory
- **Type System** (`src/types.ts`): Type checking, overflow detection, compatibility rules
- **Validation** (`src/validation.ts`, `src/pointer-validation.ts`): Comprehensive error detection

## Test Coverage

- 101 total tests (all passing)
  - 77 basic functionality tests
  - 12 compound assignment tests (new)
  - 5 VM encoding/decoding tests
- 77.33% line coverage
- Comprehensive validation test cases

## Project Created with Bun

This project was initialized with `bun init` in Bun v1.2.21. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
