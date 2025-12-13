# Out Variable Audit

## Overview

This document audits the usage of the `out` variable pattern throughout the Tuff compiler codebase. The `out` variable is a common pattern used for string accumulation in functions that build strings incrementally.

## Pattern Description

The typical pattern is:
```tuff
fn some_function(...) : String => {
  let mut out = "";  // or some initial value
  // ... accumulate into out using `out = out + "something"`
  out  // return the accumulated string
}
```

This pattern is used extensively in:
- **Emitters**: Functions that generate JavaScript code from AST nodes
- **Formatters**: Functions that format diagnostics, tokens, and other text output
- **Parsers**: Functions that reconstruct source text from parsed representations
- **Utilities**: Helper functions that build strings (e.g., path normalization)

## All Usages by File

### analyzer.tuff (3 usages)

1. **Line 181**: `path_dotted` - Converts path parts array to dotted notation (e.g., `["a", "b"]` → `"a.b"`)
   - Initial value: `"Fn"`
   - Purpose: Build type signature string

2. **Line 491**: `ty_apply_subst` - Applies type parameter substitution
   - Initial value: Substring of callee
   - Purpose: Build substituted type string

3. **Line 603**: `path_dotted` - Converts path parts to dotted string
   - Initial value: `""`
   - Purpose: Join path parts with dots

### emit/ast_js.tuff (11 usages)

1. **Line 185**: `normalize_path_seps` - Normalizes Windows backslashes to forward slashes
   - Initial value: `""`
   - Purpose: Build normalized path string

2. **Line 268**: `escape_js_string` - Escapes special characters for JS string literals
   - Initial value: `""`
   - Purpose: Build escaped string with proper JS escaping

3. **Line 317**: `emit_binop_js` - Emits binary operator as JS
   - Initial value: `"??"`
   - Purpose: Map Tuff operators to JS operators

4. **Line 333**: `emit_unop_js` - Emits unary operator as JS
   - Initial value: `"??"`
   - Purpose: Map Tuff unary operators to JS operators

5. **Line 364**: `emit_path_js` - Emits module path as JS identifier
   - Initial value: `""`
   - Purpose: Join path parts with `$` separator for JS identifiers

6. **Line 388**: `emit_struct_lit_js` - Emits struct literal as JS object
   - Initial value: `"({ "`
   - Purpose: Build JS object literal with fields

7. **Line 401**: `emit_expr_js` - Main expression emitter
   - Initial value: `"undefined"`
   - Purpose: Build JS expression code for all AST expression nodes

8. **Line 547**: `emit_stmt_js` - Main statement emitter
   - Initial value: `""`
   - Purpose: Build JS statement code for all AST statement nodes

9. **Line 600**: `emit_stmts_js` - Emits sequence of statements
   - Initial value: `""`
   - Purpose: Concatenate multiple statement emissions

10. **Line 610**: `emit_names_csv` - Emits comma-separated list of names
    - Initial value: `""`
    - Purpose: Build CSV list for import/export statements

11. **Line 638**: `emit_type_union_js` - Emits union type declaration as JS
    - Initial value: `""`
    - Purpose: Build constructor functions for union variants

12. **Line 693**: `emit_decl_js` - Main declaration emitter
    - Initial value: varies by declaration type
    - Purpose: Build JS code for top-level declarations

### parsing/decls.tuff (3 usages)

1. **Line 67**: `parse_imports` - Parses import declarations at file start
   - Initial value: `""`
   - Purpose: Accumulate emitted import statements

2. **Line 474**: Lower function (anonymous) - Lowers type union to JS
   - Initial value: `""`
   - Purpose: Build constructor function definitions

3. **Line 799**: Another lower function - Lowers type union
   - Initial value: `""`
   - Purpose: Build constructor function definitions for variants

### parsing/expr_stmt.tuff (5 usages)

1. **Line 599**: `parse_string_literal_text` - Parses string literal content with escaping
   - Initial value: `""`
   - Purpose: Build unescaped string content from source

2. **Line 1553**: `parse_char_literal_code` - Parses character literal
   - Initial value: `""`
   - Purpose: Extract character code from literal

3. **Line 1585**: Lower function - Lowers struct literal to JS during parsing
   - Initial value: `"({ "`
   - Purpose: Build JS object literal (early lowering)

4. **Line 1711**: Expression formatting - Formats call expression with args
   - Initial value: `"[" + first.v0`
   - Purpose: Build formatted expression string

5. **Line 1747**: Path building - Builds dotted path from parts
   - Initial value: `id.text`
   - Purpose: Accumulate path segments

### parsing/primitives.tuff (1 usage)

1. **Line 83**: `module_path_to_relpath` - Converts module path to file path
   - Initial value: `""`
   - Purpose: Build file path from module path (replace `::` with `/`)

### parsing/types.tuff (1 usage)

1. **Line 116**: Type annotation parsing - Builds type string with generic args
   - Initial value: `name.text`
   - Purpose: Build complete type annotation string with `<...>` if generic

### refactor/move_file.tuff (2 usages)

1. **Line 20**: `normalize_seps` - Normalizes path separators
   - Initial value: `""`
   - Purpose: Convert Windows paths to Unix-style

2. **Line 58**: Module path conversion - Converts file path to module path
   - Initial value: `""`
   - Purpose: Build module path with `::` separators

### tuffc_lib.tuff (1 usage)

1. **Line 132**: `compile_file` - Main file compilation orchestrator
   - Initial value: `"// compiled by selfhost tuffc\n"`
   - Purpose: Build complete JS module output

### util/diagnostics.tuff (2 usages)

1. **Line 30**: `errors_join` - Joins all accumulated errors
   - Initial value: `""`
   - Purpose: Concatenate all error messages

2. **Line 157**: `format_diagnostic_at` - Formats a diagnostic with source context
   - Initial value: `header`
   - Purpose: Build multi-line diagnostic with line numbers and carets

### util/lexing.tuff (3 usages)

1. **Line 169**: `emit_lex_items` - Emits token stream as source text
   - Initial value: `""`
   - Purpose: Concatenate token text for round-tripping

2. **Line 182**: `emit_trivia_items` - Emits whitespace/comments
   - Initial value: `""`
   - Purpose: Concatenate trivia text

3. **Line 192**: `emit_token_stream` - Emits tokens with leading/trailing trivia
   - Initial value: `""`
   - Purpose: Build complete source text with all trivia

## Summary

- **Total usages**: 33 functions across 10 files
- **Primary purpose**: String accumulation for code generation and formatting
- **Common pattern**: Initialize with empty string or prefix, accumulate in loop, return result
- **Alternative initial values**: 
  - Empty string `""` (most common)
  - Prefix string like `"({ "`, `"Fn"`, or `"// compiled by..."`
  - Placeholder like `"??"` for operator mapping
  - Derived value like `name.text` or substring

## Best Practices

1. **Naming**: The name `out` is consistently used for output string accumulators
2. **Mutability**: Always declared as `let mut out` since it's modified in loops
3. **Return value**: The function returns `out` as the final expression
4. **Initial value**: Set to appropriate starting value:
   - `""` for building from scratch
   - Prefix string when output has a fixed start
   - `"??"` as a sentinel for error cases in mapping functions

## Recommendations

1. **Maintain consistency**: Continue using `out` for output string accumulation
2. **Consider optimization**: For very large strings, a string builder pattern might be more efficient
3. **Document intent**: When `out` has a non-empty initial value, a comment explaining why helps readability
4. **Avoid confusion**: Don't use `out` for other purposes in the same function scope

## Related Patterns

- **Mutable accumulators**: Similar pattern used with other mutable variables like `i` (loop counter), `result`, etc.
- **Vec accumulators**: Similar pattern for building vectors, typically named `items`, `results`, or specific domain names
- **While loops**: The `out = out + something` pattern is often used in while loops for iterative construction

---

**Last Updated**: December 2025  
**Status**: Complete audit of current codebase
