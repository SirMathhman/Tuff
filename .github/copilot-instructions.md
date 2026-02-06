# Tuff Language Interpreter - AI Coding Guidelines

## Quick Reference: What is Tuff?

**Tuff** is a typed expression language interpreter written in C. It's a compile-to-C system supporting:

- **Numeric ops**: `+`, `-`, `*`, `/` with proper precedence and type overflow checking
- **Types**: Unsigned (`U8`-`U64`, `USize`), Signed (`I8`-`I64`, `ISize`), `Bool`, `Char`
- **Variables**: `let x = expr`, `let mut x = expr` with full type compatibilityChecking
- **Functions**: `fn name(param: Type) : RetType => body` with full forward reference support via prescan
- **Structs**: Field declarations, instantiation with out-of-order field init, field access
- **Arrays & Slices**: Fixed-size arrays `[Type; init_count; total_count]`, slices `&array[start..end]`
- **Pointers**: `&var`, `&mut var`, dereference `*ptr` with mutability tracking
- **Control Flow**: `if-else` expressions, `while`, `for (i in start..end)` loops, `match` patterns
- **Builtins**: String literals `"text"`, char literals `'a'`, special `__args__` for CLI args

**Key Entry Points**:

- `InterpretResult interpret(const char *str)` – Direct interpretation (no argc context)
- `InterpretResult interpret_with_argc(const char *str, int argc, const char *const *argv)` – With CLI args
- `CompileResult compile(const char *source)` – Generates C program (returns heap-allocated string)

---

## Quick Start: Making Changes

### For Adding Features:

1. **New operator?** Add to `parse_additive()` or `parse_multiplicative()` (lines 1420-1550), update `type_hierarchies[]`
2. **New type?** Add to `type_info[]` array (lines 16-30), implement validation in `validate_type()`
3. **New control flow?** Add to `parse_let_statements_loop()` (line ~830) for statement-level, or create `parse_*()` function for expressions
4. **New builtin?** Add to `parse_simple_operand()` - check for keyword, parse args, return `InterpretResult`

### For Debugging:

- **Unknown error?** Search function name in test.c (166 test cases cover all features)
- **Type mismatch?** Trace through `is_type_compatible()` and `validate_type()` (lines 100-180)
- **Parsing stuck?** Add `printf()` calls to see parser position (`p->pos`) and input ahead
- **Failed test?** Run `./test.ps1` to see which assertion failed, copy test into isolated `.c` file for debugging

### For Testing:

```powershell
# Run all 166 tests
./test.ps1

# Add new test in test.c following pattern:
void test_feature_name(void) {
    assert_success("input", expected_value, "test_feature_name");
}
```

---

### Parser Structure (`struct Parser`)

```c
Parser {
    const char *input;                      // Input string to parse
    int pos;                                // Current position in input
    Variable variables[10];                 // Stack of variable bindings
    int var_count;                          // Number of active variables
    char all_declared_names[10][32];        // Track all variable names (duplicate prevention)
    int all_declared_count;

    // Temporary storage for intermediate parse results (cleared after use)
    int has_temp_array;                     // Array literal in progress
    long temp_array_values[MAX_ARRAY_ELEMENTS];
    char temp_array_element_type[16];

    int has_temp_string;                    // String literal in progress
    char temp_string_value[256];
    int temp_string_len;

    int has_temp_struct;                    // Struct literal in progress
    int temp_struct_def_idx;
    long temp_struct_values[10];

    int temp_slice_start, temp_slice_end;   // Array slice bounds

    // Function and struct definitions (forward-referenceable)
    FunctionInfo functions[10];             // Parsed function declarations
    int functions_count;
    StructInfo structs[10];                 // Parsed struct definitions
    int structs_count;

    // Type tracking across operations
    char tracked_suffix[16];                // Current value's type (e.g., "U8", "Bool", "*I32")
    int has_tracked_suffix;
}
```

### Expression Parsing Hierarchy

Follows operator precedence (lowest to highest):

1. **`parse_expression()`** → Entry point for general expressions
2. **`parse_logical_or()`** → `||` operator
3. **`parse_logical_and()`** → `&&` operator
4. **`parse_additive()`** → `+`, `-` operators
5. **`parse_multiplicative()`** → `*`, `/` operators
6. **`parse_primary()`** → Numbers, variables, parenthesized expressions

### Statement vs. Expression Parsing

**Critical distinction**: In `parse_let_statements_loop()` (line ~830), use `saw_statement` flag to differentiate:

- **No prior statements + `if` keyword** → Expression-level `if-else` (evaluate, return value)
- **After prior statements + `if` keyword** → Statement-level `if` (execute, discard state if false)

Example:

```c
// Statement-level: if (false) discards mutations
let mut x = 2; if (false) x = 1; x  // Returns 2

// Expression-level: if-else must have matching branch types
if (true) 3 else 5  // Returns 3 (evaluates to expression value)
```

---

## Type System & Compatibility Rules

### Type Definitions

- **Signed**: `I8` (-128 to 127), `I16`, `I32`, `I64`
- **Unsigned**: `U8` (0-255), `U16`, `U32`, `U64`
- **Boolean**: `Bool` type for logical operations
- **Typeless**: Numbers without suffix (auto-widened during operations)

### Type Compatibility

Type hierarchy allows **narrower → wider** assignments:

```c
U8 + U8 → U16  // If result > 255, widdens to U16
U8 + U16 → U16  // Mixed: uses wider type
I8 + I8 → I8 (unless overflow)  // Same signedness required
```

**Validation**:

- `is_type_compatible(dest_type, source_type)` checks if assignment is valid
- `validate_type(value, suffix)` bounds-checks against type range
- Signed/unsigned must match; no I8→U16 conversions allowed

---

## Variable Management & State Restoration

Variables are stack-based in the `Parser` struct. For conditional branches (if-statements):

1. **Save state before branch**: `Parser saved = p;` (shallow copy)
2. **Execute branch**: Mutations happen in `p->variables`
3. **Restore if condition false**: Call `restore_saved_vars()` to revert mutations
4. **No restore for true branch**: Keep mutations (variables persist after statement)

**Example in `parse_if_statement()` (line ~1340)**:

```c
// Parse condition, save state
InterpretResult cond = parse_condition(p);
Variable saved_vars[10];
int saved_count = p->var_count;
memcpy(saved_vars, p->variables, sizeof(saved_vars));

// If false, parse but restore state
if (condition.value == 0) {
    parse_assignment_or_if_else(p);  // Parse then-branch
    restore_saved_vars(p, saved_vars, saved_count);  // Undo mutations
}
```

---

## Functions & Forward References

Functions are declared with `fn name(params) : ReturnType => body` and support forward references via a **prescan phase**:

1. **`prescan_function_declarations()`** — Initial pass over entire input to register all function names
2. **Normal parsing** — Executes function bodies only when invoked

**Function state isolation**: Each function call saves parser state, binds parameters as new variables, executes the function body in a protected scope, then restores the original state. This ensures parameter scope is local and mutations don't leak to callers (except through mutable pointers passed as arguments).

```c
// Forward reference is valid because prescan registered 'get' first
let result = get();
fn get() : I32 => 100;
```

---

## Structs

Structs are declared at top-level: `struct Point { x: I32; y: I32; }`. They support:

- **Field initialization**: Must initialize all fields in struct literal: `Point { x: 3, y: 4 }`
- **Out-of-order fields**: `Point { y: 4, x: 3 }` is valid
- **Field access**: `point.x` retrieves field value
- **Type checking**: Field types are validated; `point.x = true` errors if `x` is `I32`

Structs are stored in `parser.structs[]` array with metadata in `StructInfo`. Field values are stored in `Variable.struct_values[10]`.

---

## Arrays

Arrays use fixed-size bounds: `[ElementType; init_count; total_count]`

- **Literal syntax**: `[1, 2, 3]` infers type from elements
- **Indexed access**: `array[0]` retrieves element
- **Element assignment**: `array[2] = 5` increments `array_init_count` if assigning to next uninitialized element
- **Bounds checking**: Accessing uninitialized elements errors; assigned elements must be contiguous
- **Function parameters**: Array parameters require sufficient initialized elements at call site

Array data is stored per-variable with `array_values[MAX_ARRAY_ELEMENTS]`, `array_init_count`, and `array_total_count`.

---

## Pointers & Slices

**Address-of operator (`&`)** creates pointers:

- `&variable` creates immutable pointer `*Type`
- `&mut variable` creates mutable pointer `*mut Type`
- `&array[start..end]` creates a slice (pointer-to-array with bounds)
- `&array` creates implicit slice over entire array

**Dereferences**: `*pointer = value` (if mutable) or `*pointer` (read value)

**Slices** (pointer-to-array):

- Type: `*[ElementType]` or `*mut [ElementType]`
- Properties: `.length` (slice size), `.init` (initialized count)
- Bounds: Prevent out-of-bounds access; enforce element-wise contiguity
- Mutable slices can assign elements: `slice[i] = value`

Pointer targets are tracked via `Variable.pointer_target` (variable index).

---

## Strings & Characters

- **Char literals**: `'a'` evaluates to ASCII code (97 for 'a')
- **String literals**: `"test"` creates type `*Str` with immutable indexed access
- **String indexing**: `str[0]` returns character code (116 for 't' in "test")
- **Type tracking**: Strings are internally `is_string` variables, distinct from regular pointers

---

## Control Flow: Match, While, For

**Match expressions**: Pattern matching with numeric or boolean patterns:

```c
match (value) {
    case 1 => expr1;
    case 2 => expr2;
    case _ => default;
}
```

- Patterns must match value type (numeric vs. boolean)
- Wildcard `_` catches unmatched cases
- Requires either a matching case or wildcard to succeed

**While loops**: `while (condition) body` — condition must be `Bool`

- Loop re-evaluates condition each iteration; max 1024 iterations
- Mutations persist across iterations
- No initial execution (condition checked first)

**For loops**: `for (i in start..end) body` — creates immutable loop variable

- Loop variable is auto-scoped; cannot redeclare it in outer scope
- Executes `end - start` times
- Cannot assign to loop variable inside body (immutable)

---

---

## Command-Line Argument Support via `__args__`

**Feature Overview**: Tuff supports access to command-line arguments through the special `__args__` identifier. The compiler generates C code that accesses `argc`/`argv` at runtime from the generated program's own `main()`.

### Entry Point Semantics: `compile()` vs `interpret()`

**Critical Distinction**: The interpreter has two main entry points with different semantics:

- **`interpret(const char *str)`**: Generic single-argument interpreter
  - No argc context available
  - Cannot evaluate `__args__` features
  - Used for: Direct value interpretation, testing

- **`interpret_with_argc(const char *str, int argc)`**: Argc-aware interpreter
  - Full context for `__args__` evaluation
  - Can compute `__args__.length` at interpret-time
  - Required for: Interpreting code containing `__args__`

- **`compile(const char *source)`**: User-facing compiler entry point
  - Takes source code only — does NOT take argc/argv
  - When source contains `__args__`, generates C code that accesses `argc`/`argv` at runtime
  - When source does NOT contain `__args__`, interprets and bakes the constant result
  - **Key principle**: Compile produces a program; the program receives its arguments when executed

### `__args__` Compilation Patterns

The compiler translates `__args__` references to runtime C code:

| Tuff source                                      | Generated C                                           |
| ------------------------------------------------ | ----------------------------------------------------- |
| `__args__.length`                                | `return argc;`                                        |
| `__args__[1].length`                             | `return (int)strlen(argv[1]);`                        |
| `__args__[1].length + __args__[2].length`        | `return (int)strlen(argv[1]) + (int)strlen(argv[2]);` |
| `let temp : USize = __args__.length; temp`       | `int temp = argc; return temp;`                       |
| `let myArgs : *[*Str] = __args__; myArgs.length` | `char **myArgs = argv; return argc;`                  |
| `let mut x : *Str = __args__[1]; x.length`       | `char *x = argv[1]; return (int)strlen(x);`           |

### Implementation Details

**Transpiler (`compile_args_source`)**: When source contains `__args__`, the compiler uses a mini-transpiler that:

1. Splits source into semicolon-delimited statements
2. Translates each `let` declaration, variable reassignment, and expression to equivalent C
3. Tracks variable types: numeric (1), `*Str` (2), `*[*Str]` args slice (3)
4. Generates `return <expr>;` for the final trailing expression

**Expression translator (`compile_args_expression`)**: Translates individual expressions:

- `__args__.length` → `argc`
- `__args__[n].length` → `(int)strlen(argv[n])`
- `__args__[n]` → `argv[n]`
- `var.length` → `argc` (if var is args slice) or `(int)strlen(var)` (if var is `*Str`)
- Arithmetic operators are passed through directly

**Interpreter fallback**: For code without `__args__`, the compiler interprets the source and bakes the constant result (this is correct since the result doesn't depend on runtime arguments).

### Debugging `__args__` Issues

Common pitfall: **New `__args__` patterns not handled by the transpiler**

- Symptom: Generated C code fails to compile with clang
- Root cause: The `compile_args_source` transpiler only handles patterns it knows about
- Fix: Add new pattern handling to `compile_args_expression` or `compile_args_source`
- Debug: Check the generated C code by examining the CompileResult.code string

---

## Temporary State & Intermediate Results

The parser uses temporary fields to accumulate intermediate values during parsing, then consume them on assignment/declaration:

- **`has_temp_array`, `temp_array_*`**: Holds array literal `[1, 2, 3]` until assigned to a variable
- **`has_temp_string`, `temp_string_*`**: Holds string literal `"text"` until assigned to string pointer
- **`has_temp_struct`, `temp_struct_*`**: Holds struct instance `Point { x: 3, y: 4 }` until assigned
- **`temp_slice_start/end`**: Stores slice bounds from `&array[start..end]`

These fields must be **cleared after consumption** to avoid leaking values between statements. Always check flags before using data:

```c
if (p->has_temp_array) {
    // Use p->temp_array_values[], p->temp_array_element_type, p->temp_array_count
    p->has_temp_array = 0;  // Clear after use
}
```

---

## Testing Patterns

```c
// Success case: assert result.value and no error
assert_success(input_string, expected_int_value, test_name);

// Error case: assert result.has_error is true
assert_error(input_string, test_name);

// Compile + run test with args (args are passed to the compiled program at runtime)
const char *const args[] = {"arg1", "arg2", NULL};
assert_compile_success(input_string, expected_value, test_name, args);
```

### Test Coverage

Currently **166 tests** in test.c covering:

- Arithmetic: addition, subtraction, multiplication, division with operator precedence
- Type validation: overflow detection, type mismatches, type compatibility rules
- Variables: immutable/mutable declarations, scoping, compound assignments
- Control flow: if-else expressions vs. statements, while/for loops, match expressions
- Functions: declarations, parameters, forward references, calling conventions
- Structs: field declarations, instantiation, field access, type validation
- Arrays: literals, indexing, bounds checking, initialization tracking
- Pointers & slices: address-of operator, dereferencing, mutable references
- Strings & chars: literals, indexing, character codes
- Booleans: literals, logical operators, comparison operations

**Adding new tests**:

1. Create test function: `void test_name(void) { assert_success(...); }`
2. Update test runner to call your new test
3. Run test suite: `powershell test.ps1` (compiles + runs all tests)
4. All tests must pass; use temp debug files only during development, then delete

---

## Build & Test Workflow

### Compilation

```powershell
clang test.c interpret.c -o test.exe
```

**Compiler flags**: None (default C99). Warnings about `strncpy` deprecation are pre-existing.

### Test Execution

```powershell
powershell test.ps1
```

This script:

1. Compiles with clang
2. Runs `test.exe` (all 166 test functions)
3. Checks for code duplication using static analysis
4. **All tests must pass** before committing

**Temp files**: During debugging, create isolated test files (e.g., `test_debug.c`), then **delete them before final commit**. The workspace should contain only:

- `interpret.c`, `interpret.h`, `test.c`, `test.ps1`
- `.git/` directory

---

## Common Patterns & Conventions

### Keywords in Identifiers

Use `is_keyword_at(Parser *p, const char *keyword)` to check if the next token is a reserved word (if, else, let, mut, etc.). This prevents parsing "else" as a variable name.

### Number Parsing

`parse_number_raw()` returns `struct NumberValue` with:

- `long value` — numeric part
- `const char *suffix` — pointer to type suffix in input (NOT null-terminated!)
- `int suffix_len` — length of suffix (2-3 chars)

**Always extract to buffer before using**: `strncpy(buf, suffix, suffix_len); buf[suffix_len] = '\0';`

### Error Propagation

Check `result.has_error` after every parse call:

```c
InterpretResult sub = parse_additive(p);
if (sub.has_error) return sub;  // Bubble up error immediately
```

### Saving & Restoring Parser State

For backtracking or branching (e.g., trying to parse `if-else`), save `pos` and variable count:

```c
int saved_pos = p->pos;
InterpretResult attempt = parse_something(p);
if (attempt.has_error) {
    p->pos = saved_pos;  // Backtrack position only
    // For full state restore, also save/restore variables
}
```

## Guidelines for Modifications

1. **Adding new operators**: Create new precedence level in parser hierarchy (e.g., `parse_ternary()` between `parse_logical_or()` and `parse_logical_and()`)
2. **Adding new types**: Extend `type_info[]` array with new suffix and range validation
3. **Modifying type hierarchy**: Update `type_hierarchies[]` array for compatibility rules
4. **Control flow changes**: Maintain `saw_statement` logic in `parse_let_statements_loop()` to distinguish statement vs. expression context
5. **Variable scoping**: Always save/restore state before executing conditional branches; use `memcpy()` for Variable arrays

6. **Refactoring**: Extracted helpers like `parse_if_header()`, `restore_saved_vars()` reduce duplication. When repeated patterns emerge, create shared functions with clear contracts (parameter docs, return semantics).
