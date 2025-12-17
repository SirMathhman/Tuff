# Tuff Analyzer

The analyzer is responsible for **semantic analysis** of the parsed AST: type-checking, name resolution, scope validation, and compile-time optimizations. Originally a single monolithic file, it has been split into 15 focused submodules to keep file sizes manageable.

## Module Organization

Each analyzer module is independently compilable and focuses on a specific concern:

| Module                       | Purpose                                                                                            | Exports                                                                                                |
| ---------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **`typestrings.tuff`**       | Type representation and manipulation: creates type strings, generic substitution predicates        | `ty_unknown()`, `ty_void()`, `ty_name()`, `ty_tuple()`, `ty_fn_type()`, `ty_app()`, `type_to_string()` |
| **`consts.tuff`**            | Constant definitions for type names and builtin types                                              | `BUILTIN_I32`, `BUILTIN_STRING`, etc.                                                                  |
| **`defs.tuff`**              | Definition tracking: struct definitions, function signatures, imported names                       | `Def` struct, lookup functions                                                                         |
| **`env.tuff`**               | Symbol table and environment management: scope stacks, variable bindings, function contexts        | `Env` struct, scope entry/exit                                                                         |
| **`scope.tuff`**             | Scope validation: no-shadowing checks, name availability in nested scopes                          | `can_define_in_scope()`, `check_scope_conflicts()`                                                     |
| **`narrowing.tuff`**         | Type narrowing: pattern matching, exhaustiveness checking, boolean guards                          | `narrow_type()`, `check_exhaustive_patterns()`                                                         |
| **`infer_basic.tuff`**       | Basic type inference: literals, operators, function calls, generic instantiation                   | `infer_expr()`, `infer_stmt()`                                                                         |
| **`infer_narrowing.tuff`**   | Inference with narrowing: pattern-based type refinement in match arms and if-guards                | `infer_pattern_narrowing()`, `refine_in_arm()`                                                         |
| **`subst.tuff`**             | Generic type substitution: replaces type variables with concrete types during instantiation        | `substitute_type()`, `apply_subst_to_all_params()`                                                     |
| **`typecheck.tuff`**         | Type checking: validate that expressions conform to expected types, emit type mismatch errors      | `check_type()`, `emit_type_error()`                                                                    |
| **`checks.tuff`**            | Miscellaneous semantic checks: mutation validation, return type checking, call compatibility       | `check_mutable_context()`, `check_returns()`                                                           |
| **`deprecation.tuff`**       | Deprecation warnings: flag use of deprecated language features or APIs                             | `warn_deprecated()`, `check_deprecation()`                                                             |
| **`analyze_decls.tuff`**     | Per-declaration analysis: function declarations, struct definitions, imports. Calls linting rules. | `analyze_fn_decl()`, `analyze_struct_decl()`                                                           |
| **`analyze_expr_stmt.tuff`** | Expression and statement analysis: orchestrates analysis of nested expressions, statements         | `analyze_expr()`, `analyze_stmt()`, `analyze_program()`                                                |
| **`fluff.tuff`**             | Linting rules: unused variable detection, function complexity checks, naming conventions           | `fluff_warn_unused_locals_in_scope()`, `fluff_check_fn_complexity()`                                   |
| **`owns.tuff`**              | Ownership tracking: Copy/Move type classification, use-after-move detection                        | `is_copy_type()`, `is_move_type()`, `is_primitive_type()`                                              |

## Data Flow

```
AST (from parser)
  ↓
analyze_expr_stmt.tuff (main entry point)
  ├─→ Builds Env (scope stack)
  ├─→ analyze_decls.tuff (processes declarations, populates Def table)
  ├─→ infer_expr() / infer_stmt() (type inference + narrowing)
  ├─→ typecheck.tuff (validate inferred type vs expected)
  ├─→ fluff.tuff (linting checks)
  └─→ Accumulates Diagnostics
      ↓
Checked AST + Diagnostics
  ↓
emit/ (emission stage)
```

## Key Concepts

### Type Inference

The analyzer infers types for all expressions based on:

1. **Literals** — number literals default to `I32`, suffixes (`U8`, `F32`) override
2. **Variables** — look up in symbol table
3. **Function calls** — apply function signature to arguments; infer generic instantiations
4. **Operators** — binary operators like `+` have fixed signatures (`I32 → I32 → I32`)
5. **Control flow** — `if`/`else` branches must have compatible types; blocks evaluate to final expression
6. **Patterns** — `match` arms narrow types based on pattern

### Type Narrowing

When a pattern matches, the type is refined in the arm's scope:

```tuff
match x {
  Some(v) => { /* v has type T, not Option<T> */ }
  None    => { /* ... */ }
}
```

Narrowing is context-sensitive:

- `if x is_some()` narrows `x` to `Some<T>` in then-branch
- Pattern matches in `match` refine the scrutinee type
- Boolean conditions do not currently narrow (no dependent types)

### No Shadowing

Names cannot be redeclared in nested scopes. This is a design choice for clarity:

```tuff
let x = 1;
{
  let x = 2;  // Error: cannot shadow x
}
```

Checked by `scope.tuff` during declaration analysis.

### Ownership and Move Semantics

The analyzer tracks ownership for value types through `owns.tuff`:

- **Copy types**: Primitives (`I32`, `Bool`, etc.), String (temporarily), structs with all-Copy fields
- **Move types**: Function types, structs with non-Copy fields

When a Move-type value is assigned to another variable, the original is marked as "moved" and cannot be used:

```tuff
struct Container { data: String, value: I32 }

let c1 = Container { "hello", 42 };
let c2 = c1;        // c1 is moved to c2
// let x = c1.value; // Error: use of moved value: c1
```

**Current limitations (for bootstrap)**:

- String, Unknown types, and generic types are temporarily Copy to allow bootstrapping
- Function calls don't move arguments (implicit borrow)
- Future: Add `&T` borrowing syntax and explicit `.copy()` methods

### Destructors (Drop Functions)

Types can have associated drop functions that are called automatically when values go out of scope:

```tuff
struct FileHandle { fd: I32 }

fn drop_file(f: FileHandle) : Void => {
  close_file(f.fd);
}

fn main() => {
  let f: FileHandle!drop_file = open_file("data.txt");
  // ... use f ...
} // drop_file(f) called automatically here
```

The `T!dropFn` syntax marks a type as droppable:

- `dropFn` is the name of the function to call on scope exit
- Drop functions are called in LIFO order (last declared, first dropped)
- Non-droppable types (without `!`) have no automatic cleanup

**Type compatibility:**

- `T` can be assigned to `T!dropFn` (allocate the specified drop)
- `T!dropFn` cannot be assigned to `T` (would lose the drop obligation)

### Exhaustiveness Checking

`match` expressions must handle all union variants or use `_` wildcard. Analyzer validates:

```tuff
match opt {
  Some(v) => { /* ... */ }
  None    => { /* ... */ }
  // Error if missing case
}
```

## Error Handling

All errors are collected in a **Diagnostics** vector with file/line/column/message:

```tuff
error_at(file, span, "Type mismatch: expected I32, found String");
```

The analyzer does **not** halt on first error — it continues to report all issues, enabling batch error display to users.

## Generic Type Substitution

When a generic function is instantiated:

```tuff
fn id<T>(x: T) : T => x;
let f : (I32) => I32 = id<I32>;  // Instantiates T := I32
```

The analyzer uses `subst.tuff` to replace type variables with concrete types in the function's signature.

## Integration with Other Stages

- **Parser output** — AST with type annotations on declarations; analyzer fills in inferred types
- **Emitter input** — Checked AST with fully resolved types; emitter generates type-aware JavaScript
- **Linting** — `fluff.tuff` provides rules for complexity, naming, and unused-variable checks

## Adding a Semantic Check

1. Identify the concern (e.g., "type narrowing in pattern guards")
2. Choose or create a module (`infer_narrowing.tuff`, `checks.tuff`, or new module)
3. Implement analysis function, call from `analyze_expr_stmt.tuff` or appropriate stage
4. Add diagnostic emission if error
5. Write tests in `.tuff` test files or TypeScript tests

## Testing

Tests validate:

- Type inference correctness
- Error message formatting
- Narrowing behavior
- Generic instantiation
- No-shadowing enforcement
- Exhaustiveness checking

Run analyzer tests:

```bash
npm test -- --reporter=verbose selfhost_types.test.ts
npm test -- selfhost_diagnostics.test.ts
```
