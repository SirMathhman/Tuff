# Tuff Compiler - Agent Instructions

## Project Overview
Tuff is a C-like programming language designed to eliminate undefined behavior, except when interfacing with external code. The compiler (`tuffc`) generates C code that is then compiled with `clang`. See [ROADMAP.md](ROADMAP.md) for planned features.

## Build & Test
```bash
cargo build    # Compile
cargo test     # Run 83 end-to-end tests (compile Tuff → C → clang → execute)
cargo run      # Compile main.tuff → main.c (doesn't invoke clang)
```
- **Gated Checks** (`.github/hooks/hooks.json`): `cargo test` and PMD CPD (50-token minimum on `src/`) run on workspace stop. Both must pass.
- **Watch mode**: `watch.ps1` runs `watchexec -e tuff,rs -r -- cargo run` for hot-reload development.

## Architecture
- **Codegen approach**: Tuff source → C code → clang → native executable
- **Zero dependencies**: Self-contained compiler, no external crates
- **End-to-end testing**: Tests actually compile and run generated C code via `clang`
- **Single-file compiler**: All code in `src/main.rs` (~3760 lines, tests start at line 3033)

### Source Layout (`src/main.rs`)
| Lines     | Section                              |
|-----------|--------------------------------------|
| 1–100     | Imports, type aliases, `CompileContext` |
| 100–200   | `ReadTracker`, comment stripping     |
| 200–400   | `main()`, `find_reads_in_order`, helper functions |
| 400–600   | `generate_*` functions (structs, unions, typedefs) |
| 600–800   | `compile()`, `parse_let_declaration` |
| 800–1000  | `is_valid_type`, `tuff_type_to_c`    |
| 1000–2800 | `compile_expression` — core recursive descent parser (~1800 lines) |
| 2800–3030 | Type utilities, monomorphization helpers |
| 3033–end  | `#[cfg(test)] mod tests` — 83 end-to-end tests |

### Key Functions
- `compile(source: &str) -> Result<String, CompileError>` — main entry point; returns C code
- `compile_expression(expr, ctx)` — recursive descent parser/compiler; heart of the compiler
- `CompileContext::new(vars)` — constructor eliminating init duplication (PMD CPD requirement)
- `parse_generic_params`, `build_c_function`, `compile_fn_call` — extracted helpers (PMD CPD)
- `sanitize_type_name()` — converts Tuff types to C-safe names (e.g., `I32` → `i32`)
- `generate_union_typedefs()` — generates C tagged union structs with enum tags
- `main()` — reads `main.tuff`, compiles to `main.c` (does NOT invoke clang)

## Tuff Language Features (Implemented)
- `read()` / `read<Bool>()` - reads from stdin; multiple calls map to separate variables
- `let x = expr;` - variable declarations with recursive expression compilation
- `let mut x = ...; x = ...` - mutable variables with reassignment support
- Compound assignment: `+=`, `-=`, `*=`, `/=`
- Type annotations: `let x : I32 = 100`, array types: `let x : [I32; N] = [...]`
- Array literals: `[a, b, c]`, nested arrays: `[[a], [b]]`, repeat syntax: `[val; count]`
- Control flow: `if`, `while`, `for`
- Functions: `fn name(params) => body;`
- **Generic functions**: `fn pass<T>(param : T) => body;` with monomorphization (`pass<I32>(x)` → `pass_I32(x)`)
- Structs: `struct` definitions with C `typedef` generation
- **Generic structs**: `struct Wrapper<T> { value : T }` with monomorphization (`Wrapper<I32>` → `Wrapper_I32`)
- Block expressions with `{ let ...; expr }` for scoped variables
- Braces-to-parens conversion in expressions
- Type-check operator: `expr is Type` — returns 1 if types match, 0 otherwise (tracks `let x : Type` annotations)
- Logical not: `!expr` — unary negation operator
- **String literals**: `"hello"` with `&Str` type annotation
- **String `.length` property**: `str.length` → `(int)strlen(str)` for `&Str` types
- **Union type aliases**: `type Result = Ok | Err` with struct variants
- **Tagged unions**: `let result : Result = if (cond) Ok { ... } else Err { ... }` — generates C struct with enum tag + union data
- **Runtime tag checking**: `result is Ok` generates `result.tag == Tag_Ok` for tagged union variables
- **Rest parameters**: `fn toArray<L : USize>(...args : [I32; L])` — collects arguments into an array; `L` inferred from argument count at call sites
- **Type cast**: `expr as Type` — generates C cast expression; works with `is` type checks
- **Parenthesized expressions**: `(expr)` — strips parens and compiles inner expression (except tuple literals like `(a, b)`)
- **Tuple literals**: `(a, b)` — generates C struct with `.f0`, `.f1` fields; usable as generic type args
- **Logical operators**: `&&`, `||` — short-circuit evaluation
- **Comparison operators**: `<`, `==` — binary comparison
- **Literal suffixes**: `100U8`, `100I64` — range validation for `U8` (0–255)
- **USize type**: `USize` for unsigned size types (used in rest param length inference)
- **Pointer types**: `let y : *I32 = &x` — pointer type annotation with address-of operator
- **Address-of operator**: `&x` — generates C `&x` for taking variable addresses
- **Dereference operator**: `*y` — generates C `(*y)` for pointer dereference
## Key Conventions
- Rust 2024 edition
- `compile(source: &str) -> Result<String, CompileError>` - main compiler entry point (returns C code)
- `CompileContext` struct passed mutably between compiler functions (vars, mutable_vars, declared_vars, etc.)
- `CompileContext::new(vars)` - constructor eliminates 10-line init duplication (PMD CPD requirement)
- Helper functions: `parse_generic_params`, `build_c_function`, `compile_fn_call` - extracted to satisfy PMD CPD 50-token hook
- `GenericStructTemplate`: `{name, type_params, fields_str}` - stores generic struct definitions
- `GenericFunctionTemplate`: `{name, type_params, param_names, rest_params, body, return_type}` - stores generic function definitions
- Monomorphization: Runtime type substitution (e.g., `Wrapper<I32>` → `Wrapper_I32`, `pass<I32>` → `pass_I32`)
- `union_types: HashMap<String, Vec<String>>` — tracks union aliases with struct variant names
- `tagged_union_vars: HashSet<String>` — tracks variables using tagged union assignments
- `generate_union_typedefs()` — generates C tagged union typedefs with enum tags and union data
- `generate_tagged_union_if_else()` — generates if/else block with tag assignments for union variants
- `to_lower_first()` — converts struct names to lowercase-first for C field naming
- Test helpers: `expect_valid(source, stdin_str, exit_code)` and `expect_invalid(source)`
- Use `#[allow(dead_code)]` on test helper functions
- Temp files use atomic counter (`TEMP_COUNTER`) for thread-safe naming
- `CompileError = String` - will need custom error enum as compiler grows

## Current Status
Expression-level compiler with let declarations, mutability, arrays (flat & nested), type checking, IO, control flow, functions, generic functions, structs, generic structs, logical not, type-check operator, tagged unions with runtime tag checking, rest parameters, and type cast operator. All 83 tests pass. Next: proper lexer → parser AST → typed codegen pipeline.

## Files
- `src/main.rs` — Single-file compiler (~3760 lines)
- `main.tuff` — Sample/demo Tuff program (mirrors Rust stdlib types: Box, Vec, HashMap, etc.)
- `main.c` — Generated C output from `main.tuff` (auto-generated, do not edit manually)
- `ROADMAP.md` — Feature roadmap with implemented (✅) and pending features
- `.github/hooks/hooks.json` — Gated checks config (cargo test + PMD CPD)

## Pitfalls
- `main()` reads `main.tuff` and compiles to `main.c` — it does NOT invoke `clang`; tests call `compile()` directly
- Windows-specific (`.exe`, clang on Windows) — consider cross-platform later
- Parser uses string splitting/matching instead of proper tokenization; recursion-based expression compilation can be fragile with nested structures
- Array element assignment (`x[0] = ...`) works via mutable variable tracking but is syntax-lowered, not AST-based
- Parser queue gotcha: if parser emits queued statements (syntax-lowering), EOF loops must drain the queue (`while !eof || queue.length > 0`) or trailing lowered declarations are silently dropped
- `compile_expression` (~1800 lines) is the core — changes here affect most features; add tests for edge cases
- When adding new language features, add end-to-end tests that compile through clang and verify exit code

## Gated Checks (`.github/hooks/hooks.json`)
- `cargo test` must pass on stop
- PMD CPD copy-paste detection runs on `src/` with 50-token minimum
- Temp file cleanup silently ignores errors