# Tuff Language Interpreter - AI Coding Guidelines

## Project Overview

**Tuff** is a typed expression language interpreter written in C. It supports:

- Numeric expressions with `+`, `-`, `*`, `/` operations
- Typed integers: `U8` (0-255), `U16/U32/U64` (unsigned), `I8` through `I64` (signed)
- Typeless integers (auto-widened to accommodate results)
- Variables with `let mut x = expr;` syntax
- Control flow: `if` expressions and statements
- Boolean logic: `&&`, `||`, comparison operators

**Key Entry Point**: `interpret(const char *str)` in [interpret.c](../interpret.c) — parses and evaluates input strings, returns `InterpretResult` struct with value and optional error.

---

## Architecture: Recursive Descent Parser with State Management

### Parser Structure (`struct Parser`)

```c
Parser {
    const char *input;           // Input string to parse
    int pos;                     // Current position in input
    Variable variables[10];      // Stack of variable bindings
    int var_count;               // Number of active variables
    char all_declared_names[10][32];  // Track all declared names (for duplicate checks)
    int all_declared_count;
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

## Testing Patterns

### Test Helpers in [test.c](../test.c)

```c
// Success case: assert result.value and no error
assert_success(input_string, expected_int_value, test_name);

// Error case: assert result.has_error is true
assert_error(input_string, test_name);
```

### Test Coverage

Currently **56 tests** in [test.c](../test.c) covering:

- Arithmetic: addition, subtraction, multiplication, division (lines ~50-100)
- Type validation: overflow detection, type mismatches (lines ~100-200)
- Variables: `let`, `mut`, assignments, blocks (lines ~200-250)
- Control flow: if-else expressions, if-only statements (lines ~250-358)

**Adding new tests**:

1. Create test function: `void test_name(void) { assert_success(...); }`
2. Run test suite: `powershell test.ps1` (compiles + runs all tests)
3. All 56 tests must pass; use temp debug files only during development, then delete

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
2. Runs `test.exe` (all 56 test functions)
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

---

## Key Files & Line Ranges

| File                          | Purpose                         | Key Sections                                                                                                                     |
| ----------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| [interpret.h](../interpret.h) | Public API                      | `InterpretResult` struct, `interpret()` declaration                                                                              |
| [interpret.c](../interpret.c) | Parser & evaluator (1867 lines) | Type system (lines 1-200), parser hierarchy (lines 690-1700), main entry (lines 1820-1867), if-statement logic (lines 1340-1550) |
| [test.c](../test.c)           | Unit tests                      | Helpers (lines 4-24), test functions (lines 26-358)                                                                              |
| [test.ps1](../test.ps1)       | Build script                    | Clang compilation, test execution                                                                                                |

---

## Guidelines for Modifications

1. **Adding new operators**: Create new precedence level in parser hierarchy (e.g., `parse_ternary()` between `parse_logical_or()` and `parse_logical_and()`)
2. **Adding new types**: Extend `type_info[]` array with new suffix and range validation
3. **Modifying type hierarchy**: Update `type_hierarchies[]` array for compatibility rules
4. **Control flow changes**: Maintain `saw_statement` logic in `parse_let_statements_loop()` to distinguish statement vs. expression context
5. **Variable scoping**: Always save/restore state before executing conditional branches; use `memcpy()` for Variable arrays

6. **Refactoring**: Extracted helpers like `parse_if_header()`, `restore_saved_vars()` reduce duplication. When repeated patterns emerge, create shared functions with clear contracts (parameter docs, return semantics).
