# Feature 19: Multiple-Of Type Constraints

This feature introduces compile-time constraints on numeric values using the `*` operator in type annotations.

## Syntax

```tuff
let x: I32 * 5I32 = 10I32;  // x must be a multiple of 5
```

## Type Representation

- `I32 * 5I32` means "an I32 that is a multiple of 5"
- Works with all numeric types (I8-I64, U8-U64, USize)

## Features

1. **Literal Validation**: Only literal values can be assigned to constrained types
2. **Subtyping**: `I32 * 10I32` can be assigned to `I32 * 5I32`
3. **Arithmetic Tracking**:
   - `(I32 * 5I32) + (I32 * 5I32) = I32 * 5I32`
   - `(I32 * 5I32) + (I32 * 3I32) = I32 * 5I32 + I32 * 3I32`
4. **No Runtime Overhead**: Constraints are compile-time only

## Tests

- `test_basic.tuff`: Basic usage with different multiples
- `test_arithmetic.tuff`: Arithmetic with same multiple
- `test_subtyping.tuff`: Subtype assignment
- `test_invalid_literal.tuff`: Error case - wrong multiple
- `test_non_literal.tuff`: Error case - non-literal value
- `test_literal_return.tuff`: Literal return from function
