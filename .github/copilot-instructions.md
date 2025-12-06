# Tuff Interpreter - AI Coding Agent Instructions

## Project Overview

Tuff is a **statically-typed interpreter** for a custom imperative language with closures, OOP, and automatic memory management. The interpreter is implemented as a Rust library crate with a single public entry point: `interpret(input: &str) -> Result<String, String>`.

## Architecture

### Core Pipeline: String In → Result Out

1. **Tokenization** ([parser.rs](../src/parser.rs)): `tokenize_expr()` splits input into tokens, handling operators, parentheses, and type suffixes
2. **RPN Conversion** ([parser.rs](../src/parser.rs)): `tokens_to_rpn()` converts infix to Reverse Polish Notation using Shunting Yard
3. **Evaluation** ([evaluator.rs](../src/evaluator.rs)): `eval_rpn_generic()` evaluates RPN with type-aware arithmetic (U8, I8, I32, etc.)
4. **Statement Processing** ([statement/](../src/statement/)): Handles declarations, control flow, functions, classes, and memory management

### Key Data Structures

- **`Var`** ([statement/mod.rs](../src/statement/mod.rs)): Represents variables with `value`, `mutable`, `suffix` (type), `borrowed_mut`, `declared_type`
- **Environment**: `HashMap<String, Var>` storing variables with special prefixes:
  - `__fn__<name>`: Function definitions (format: `captures|params|return_type|body`)
  - `__captures__<name>`: Explicit capture specifications for closures
  - `__struct__<name>`: Struct type definitions
  - `__drop__<type>`: Drop handlers for automatic cleanup
  - `__type__<name>`: Type aliases

### Multi-File Module System

- **`interpret_all()`** ([lib.rs](../src/lib.rs)): Entry point for multi-file execution
- **`use module::item;`**: Import syntax that loads from `source_set: HashMap<String, String>`
- **`out let item = value;`**: Export syntax in module files

## Critical Implementation Details

### Type System & Range Checking

- **Type Suffixes**: `I8`, `I32`, `U8`, `U16`, `U64` - validated in [range_check.rs](../src/range_check.rs)
- **Type Validation**: All arithmetic operations check for overflow/underflow using `checked_add/sub/mul`
- **Type Aliases**: `type MyInt = I32` stored as `__type__MyInt` with resolution via `resolve_alias()` ([statement/validate.rs](../src/statement/validate.rs))
- **Drop Handlers**: `type DroppableI32 = I32!drop` enables automatic cleanup at scope exit

### Automatic Capture Detection

- **Immutable Captures**: Variables read in function bodies are automatically captured as `&x` ([statement/mut_capture.rs](../src/statement/mut_capture.rs))
- **Mutable Captures**: Variables assigned in function bodies are captured as `&mut x`
- **Detection Logic**: `detect_captures()` analyzes function bodies to determine capture modes before registration

### Borrow Checking

- **Single Mutable Borrow Rule**: `borrowed_mut` flag prevents multiple `&mut` references ([pointer_utils.rs](../src/pointer_utils.rs))
- **Immutable + Mutable Conflict**: Taking `&x` while `&mut x` exists is an error
- **Pointer Types**: `*I32` (immutable) and `*mut I32` (mutable) with `&` and `&mut` operators

### Class Sugar Transformation

- **`class fn Point(x: I32, y: I32) => { ... }`** → **`fn Point(...) => { ...; this }`**
- **`this` Keyword**: Returns current environment snapshot as a struct instance
- **Method Binding**: Functions defined in constructor bodies automatically capture constructor parameters

## Development Workflow

### Testing

```powershell
cargo test -q              # Run all tests quietly
cargo test test_name       # Run specific test
```

- **Test Structure**: [tests/integration_tests.rs](../tests/integration_tests.rs) contains comprehensive interpreter tests using `assert_eq!(interpret("..."), Ok("..."))` patterns
- **Test Coverage**: Each language feature has corresponding test cases (see `interpret_strips_type_like_suffix` test)

### Pre-Commit Hook

```powershell
git config core.hooksPath .githooks   # Enable once per clone
```

- **Enforced**: `.githooks/pre-commit` runs `cargo clippy --all-targets --all-features -- -D warnings`
- **Zero Tolerance**: Commits blocked on any Clippy warnings/errors

### Code Quality Rules ([Cargo.toml](../Cargo.toml) & [clippy.toml](../clippy.toml))

```toml
[lints.clippy]
unwrap_used = "deny"        # Use .ok_or_else() or .map_err() instead
expect_used = "deny"        # Same as above
indexing_slicing = "deny"   # Use .get(i).ok_or_else() instead
panic = "deny"              # Return Result<T, String> errors
todo/unimplemented = "deny" # All code must be complete
too-many-arguments-threshold = 3  # Max 3 function parameters
```

**Pattern**: All errors are `Result<T, String>` with descriptive messages. Use `.ok_or_else(|| "error msg".to_string())?` for Option handling.

### Copy-Paste Detection

```powershell
.\run-cpd.ps1    # Runs PMD CPD with 50-token threshold
```

- **Purpose**: Identifies code duplication in `src/` directory
- **Exit Codes**: 0 = clean, 4 = duplicates found

## Common Patterns

### Adding a New Statement Type

1. Update [statement/top.rs](../src/statement/top.rs) in `process_single_stmt_internal()` with prefix check
2. Add parsing logic to extract components (use `brace_utils::find_matching_brace()` for nested blocks)
3. Update environment and call `eval_expr_with_env()` for expression evaluation
4. Add comprehensive tests in [tests/integration_tests.rs](../tests/integration_tests.rs)

### Adding a New Operator

1. Update [parser.rs](../src/parser.rs): Add token recognition in `tokenize_expr()` and precedence in `tokens_to_rpn()`
2. Update [evaluator.rs](../src/evaluator.rs): Add case to `apply_unsigned_op()`/`apply_signed_op()` with overflow checking
3. Test with all type suffixes (U8, I8, I32, etc.)

### Function Call Evaluation

- **Lookup**: Retrieve `__fn__<name>` from environment
- **Parse Format**: `captures|params|return_type|body` or `params|return_type|body`
- **Execution**: Clone environment, bind arguments, evaluate body with `eval_block_expr_mut()` ([statement/block.rs](../src/statement/block.rs))
- **Early Return**: Handled via `__RETURN__:value|suffix` error propagation

## Language Specification

Full language documentation: [LANGUAGE_SPEC.md](../LANGUAGE_SPEC.md)

**Key Features**:

- Closures with automatic/explicit capture syntax
- Classes as syntactic sugar for constructor functions
- Struct types with destructuring assignment
- Pointer types with borrow checking
- Drop handlers for RAII-style cleanup
- Type inference with explicit annotation support
- Control flow: `if/else`, `while`, `return`

## Common Errors & Solutions

| Error Pattern                            | Cause                    | Fix                                             |
| ---------------------------------------- | ------------------------ | ----------------------------------------------- | --- | ---------- |
| `assignment to immutable variable`       | Assigning to `let x`     | Use `let mut x`                                 |
| `variable x is already mutably borrowed` | Multiple `&mut x`        | Drop previous borrow before taking new one      |
| `type suffix mismatch`                   | Mixing `1U8 + 2I32`      | Use consistent type suffixes in expressions     |
| `value out of range for U8`              | Overflow (e.g., `256U8`) | Check max values: U8=255, I8=-128..127          |
| `negative value for unsigned suffix`     | `-5U8`                   | Use signed types (I8, I32) for negative numbers |
| `indexing_slicing clippy error`          | Using `vec[i]`           | Use `vec.get(i).ok_or_else(                     |     | "error")?` |

## File Organization

```
src/
├── lib.rs              # Entry points: interpret(), interpret_all()
├── parser.rs           # Tokenization & RPN conversion
├── evaluator.rs        # Type-aware arithmetic evaluation
├── eval_expr.rs        # Expression evaluation with environment access
├── statement/
│   ├── top.rs          # Main statement dispatcher
│   ├── block.rs        # Block expression evaluation with drop handlers
│   ├── mut_capture.rs  # Automatic capture detection for closures
│   ├── ptr.rs          # Pointer/reference operations
│   └── validate.rs     # Type validation & alias resolution
├── brace_utils.rs      # Brace/parenthesis matching utilities
├── control.rs          # if/else/while statement handling
├── fn_utils.rs         # Function call parsing & execution
├── pointer_utils.rs    # Borrow checking logic
├── property_access.rs  # Struct field & method access
└── range_check.rs      # Type suffix definitions & overflow checks
```

## When Modifying Code

1. **Always** return descriptive error strings (not generic "error occurred")
2. **Never** use `unwrap()`, `expect()`, `panic!()`, `todo!()`, or array indexing
3. **Preserve** type suffix validation - all arithmetic must check overflow
4. **Test** with examples from [LANGUAGE_SPEC.md](../LANGUAGE_SPEC.md) after changes
5. **Run** `cargo clippy` before committing (pre-commit hook enforces this)
