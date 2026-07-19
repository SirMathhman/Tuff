# Tuffc — Tuff Language Compiler

## Quick Start

```bash
cargo test              # Run all tests
cargo clippy            # Check for lint warnings
cargo clippy -- -D clippy::excessive_nesting  # CI check (pre-commit hook)
```

## Pre-commit Hooks

All three must pass before committing (enforced via `.github/hooks/hooks.json`):

1. `cargo test` — all tests pass
2. `pmd cpd --dir src --language rust --minimum-tokens 50 --ignore-literals --ignore-identifiers` — no copy-paste violations
3. `cargo clippy -- -D clippy::excessive_nesting` — nesting depth enforced at threshold 2 (see `clippy.toml`)

## Project Structure

Single-file crate, zero external dependencies (Rust 2024 edition):

```
src/main.rs  — Entire compiler + test suite
```

## Architecture

A compiler from **Tuff** (systems language with zero UB) to **C**, then compiled via `clang`:

### Compilation Pipeline
1. `tokenize(input) -> Result<Vec<Token>, Error>` — lexical analysis
2. `parse_stmts(tokens, pos, env, c_stmts)` — statement parsing (let, assign, blocks)
3. `parse_expression(tokens, pos, env) -> Result<TypedValue, Error>` — expression parsing (precedence climbing)
4. `compile_tuff_to_c(input) -> Result<String, Error>` — orchestrates pipeline, emits C code
5. `execute_generated_c(c_code, args) -> i32` — writes temp `.c`, compiles with `clang`, runs, cleans up

### Expression Precedence (lowest → highest)
`or` → `and` → `equality` (==, !=) → `comparison` (<, <=, >, >=) → `additive` (+, -) → `multiplicative` (*, /, %) → `unary` (-, !) → `primary` (literals, vars, parens)

### Key Data Structures
- `Token` — enum of all lexical tokens (literals with value+suffix, identifiers, keywords, operators)
- `TypedValue` — compile-time evaluated value with `value: i128`, `type_name: String`, `is_mut: bool`
- `VarEnv` — variable environment with shadowing support (`vars`, `c_names`, `shadow_count` maps)
- `shadow_name(name, count)` — generates unique C variable names for shadowed Tuff variables

### Type System
- All arithmetic evaluated at compile-time using `i128` intermediate, then bounds-checked against target type
- Type promotion: higher-ranked type wins (`type_rank` function)
- Supported types: `Bool`, `U8`, `I8`, `I16`, `I32`, `U32`, `I64`, `U64`
- Type suffixes on literals: `42U8`, `-1I8`, unsuffixed defaults to `I32`
- Overflow/underflow checked at compile-time against `type_bounds`

### Block Scoping
- `parse_block_stmt` saves/restores `VarEnv` state using key sets (not clone/restore)
- Variables declared inside `{}` are removed after block closes
- Mutable variables can be reassigned across nested blocks if declared outside

## Testing

All tests live in `#[cfg(test)] mod tests` inside `src/main.rs`:

- `expect_valid(input, args, expected_exit_code)` — full compile → run → assert exit code
- `expect_invalid(input)` — assert compilation fails (returns `Err`)

**Test naming convention**: `feature_category_specific_case` (e.g., `arithmetic_overflow_u8`, `let_shadow`, `block_scoped_var`)

**Test organization**: Grouped by feature with `// --- Positive: ... ---` and `// --- Negative: ... ---` comment separators.

## Tuff Language Design (Essential)

- **Target**: Experienced C/C++ developers, zero undefined behavior, no `unsafe`
- **Syntax**: Modern C-like (curly braces, semicolons)
- **Memory**: Ownership/borrowing (lexical lifetimes), stack-only initially
- **Types**: Fixed-size ints (U8–U64, I8–I64), F32/F64, Bool, Char, &Str, enums, unions, structs, generics (monomorphized)
- **No**: macros, function overloading, raw pointers, heap allocation (built-in)
- **Self-hosting roadmap**: Stage 0 (host lang) → Stage 1 (minimal Tuff) → Stage 2 (self-compiled)

For the full language specification, see `SPECIFICATION.md` and `UB_PREVENTION.md` when available.

## Common Pitfalls

- **Nesting threshold**: `clippy.toml` enforces max nesting depth of 2. Use early returns or helper functions to flatten.
- **Error type**: All parser/compiler functions return `Result<T, std::fmt::Error>` — a zero-sized error type (no error messages yet).
- **Compile-time evaluation**: All expressions are evaluated at compile-time (no runtime expression support yet).
- **Shadowing**: Each `let` with the same name gets a unique C variable name (`x`, `x_1`, `x_2`, ...) via `VarEnv::fresh_c_name`.
- **Block scope cleanup**: Variables are filtered by key set retention, not by cloning/restoring the environment.