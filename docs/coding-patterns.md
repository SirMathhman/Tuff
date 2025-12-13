# Tuff Compiler Coding Patterns

This document describes common coding patterns and conventions used in the Tuff compiler codebase.

## String Accumulation Pattern

The Tuff compiler uses a consistent pattern for building strings incrementally. This is the primary pattern for code generation, formatting, and text processing.

### Basic Pattern

```tuff
fn build_something(...) : String => {
  let mut out = "";
  // ... accumulate into out
  out = out + "some text";
  out = out + another_string;
  // ... more accumulation
  out  // return the final string
}
```

### Key Characteristics

1. **Variable name**: Always use `out` for output string accumulators
2. **Mutability**: Declare as `let mut out` since it will be modified
3. **Initialization**: Choose appropriate initial value:
   - `""` - empty string for building from scratch (most common)
   - `"prefix"` - when output has a fixed prefix
   - `"??"` - as a sentinel/placeholder in mapping functions
   - `substring` or `name.text` - when starting from a known value

4. **Accumulation**: Use `out = out + value` pattern in loops
5. **Return**: Function returns `out` as the final expression (no semicolon)

### Examples from the Codebase

#### Example 1: Simple String Building

```tuff
fn escape_js_string(s: String) : String => {
  let mut out = "";
  let mut i = 0;
  while (i < stringLen(s)) {
    let ch = stringCharCodeAt(s, i);
    if (ch == 34) {  // '"'
      out = out + "\\\"";
      i = i + 1;
      continue;
    }
    out = out + stringFromCharCode(ch);
    i = i + 1;
  }
  out
}
```

#### Example 2: String Building with Prefix

```tuff
fn emit_struct_lit_js(nameExpr, values) : String => {
  let mut out = "({ ";
  let fields = find_struct_fields(nameExpr);
  let mut i = 0;
  while (i < vec_len(fields)) {
    if (i > 0) { out = out + ", "; }
    out = out + (vec_get(fields, i) + ": " + emit_expr_js(vec_get(values, i)));
    i = i + 1;
  }
  out = out + " })";
  out
}
```

#### Example 3: Operator Mapping with Sentinel

```tuff
fn emit_binop_js(op) : String => {
  let mut out = "??";  // sentinel for unknown operators
  if (op.tag == "OpAdd") { out = "+"; }
  if (op.tag == "OpSub") { out = "-"; }
  if (op.tag == "OpMul") { out = "*"; }
  // ... more operators
  out
}
```

### Why This Pattern?

1. **Simplicity**: Easy to understand and maintain
2. **Consistency**: Same pattern used throughout the codebase
3. **Readability**: Clear intent with the name `out`
4. **Bootstrap compatibility**: Works well with the current Tuff subset

### Future Optimizations

For very large strings, a string builder or rope data structure might be more efficient than repeated concatenation. However, for the current compiler use cases, this simple pattern is sufficient and preferred for consistency.

## Vector Accumulation Pattern

Similar to string accumulation, but for building vectors:

```tuff
fn collect_items(...) => {
  let mut items = vec_new();
  // ... collect items
  vec_push(items, item);
  // ... more collection
  items
}
```

Common variable names:
- `items` - generic collection
- `results` - for computed results
- `names`, `types`, `exprs`, etc. - domain-specific collections

## Loop Counter Pattern

Standard loop counter pattern:

```tuff
let mut i = 0;
while (i < limit) {
  // ... do something with i
  i = i + 1;
}
```

- **Name**: `i` for simple counters, `idx` for indices, or descriptive names for clarity
- **Increment**: Always `i = i + 1` at the end of the loop body
- **Early continue**: When using `continue`, ensure `i = i + 1` happens before the continue

## Mutable State Pattern

For tracking state during iteration:

```tuff
let mut accumulator = initial_value;
let mut i = 0;
while (i < vec_len(items)) {
  let item = vec_get(items, i);
  // ... update accumulator based on item
  accumulator = update(accumulator, item);
  i = i + 1;
}
accumulator
```

## Error Accumulation Pattern

For collecting errors without aborting:

```tuff
// In diagnostics.tuff
let mut __tuffc_errors = vec_new();

fn error_at(msg: String, startOffset: I32, endOffset: I32) : Void => {
  vec_push(__tuffc_errors, format_diagnostic_at(msg, "", startOffset, endOffset));
}

fn errors_join() : String => {
  let mut out = "";
  let mut i = 0;
  while (i < vec_len(__tuffc_errors)) {
    out = out + vec_get(__tuffc_errors, i);
    i = i + 1;
  }
  out
}
```

## Naming Conventions

### Variables

- `out` - output string accumulator
- `i`, `j`, `k` - loop counters
- `items`, `names`, `types` - collections
- `mut` prefix - not used in names; use `let mut` syntax instead

### Functions

- `emit_*` - code generation functions
- `parse_*` - parsing functions
- `format_*` - formatting functions
- `*_js` suffix - JavaScript-specific functions
- `*_tuff` suffix - Tuff-specific functions

### Predicates

- `is_*` - boolean predicates (e.g., `is_digit`, `is_ident_start`)
- `has_*` - existence checks (e.g., `has_side_effect`)
- `needs_*` - requirement checks (e.g., `needs_vec_rt`)

## Commenting Conventions

### When to Comment

- Complex algorithms that aren't self-evident
- Non-obvious design decisions
- Workarounds for current compiler limitations
- ASCII code constants (e.g., `// '"'` for 34)

### When NOT to Comment

- Obvious code that matches the function name
- Simple loops and accumulation patterns
- Standard idioms already documented here

### Comment Style

```tuff
// Single-line comments for brief notes
// Use multiple single-line comments for longer explanations
// Keep comments concise and up-to-date

/* Block comments for longer
   multi-paragraph explanations
   or for temporarily disabling code */
```

## Best Practices

1. **Consistency over cleverness**: Use established patterns even if alternatives exist
2. **Mutability discipline**: Only use `mut` when necessary; prefer immutable bindings
3. **Early returns**: Use `yield` for early returns from functions
4. **Guard clauses**: Handle edge cases at the start of functions
5. **Small functions**: Keep functions focused on a single responsibility
6. **Explicit types**: Add type annotations for function parameters and returns

## Anti-Patterns to Avoid

1. **Variable shadowing**: Not allowed in Tuff (compiler enforces this)
2. **Side effects in expressions**: Minimize; use statements for side effects
3. **Magic numbers**: Use named constants or add comments for ASCII codes
4. **Deep nesting**: Refactor deeply nested code into helper functions
5. **Inconsistent naming**: Follow the established conventions

---

**See Also**:
- [Out Variable Audit](./out-audit.md) - Complete audit of `out` usage
- [Phase 4/5 Backlog](./phase4-5-backlog.md) - Current development priorities
- [LANGUAGE.md](../LANGUAGE.md) - Language specification and syntax

**Last Updated**: December 2025
