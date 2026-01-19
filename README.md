# Tuff

A stack-based virtual machine compiler with support for type-safe let bindings.

## Features

### Type System

- **Explicit Type Annotations**: Declare variable types explicitly

  ```
  let x : U8 = read U8; x
  ```

- **Type Inference**: Omit type annotations for simpler code

  ```
  let x = read U8; x
  ```

- **Implicit Type Upcasting**: Automatically upcast from smaller to larger types of the same sign

  ```
  let x : U16 = read U8; x  // U8 → U16 (valid)
  let y : U32 = read U16; y  // U16 → U32 (valid)
  ```

- **Downcast Prevention**: Prevents unsafe downcasting operations

  ```
  let x = read U16; let y : U8 = x; y  // Error: U16 → U8 (invalid)
  ```

- **Sign Safety**: Prevents conversion between signed and unsigned types
  ```
  let x : I8 = read U8; x  // Error: unsigned → signed (invalid)
  ```

### Let Bindings

- **Statement-Level Bindings**: Use let bindings at the top level

  ```
  let temp : U8 = read U8 * read U8; temp
  ```

- **Chained Bindings**: Chain multiple let bindings together

  ```
  let x = read U16; let y : U8 = read U8; y
  ```

- **Multiple Variables in Scope**: Reference any previously bound variable

  ```
  let x = read U8; let y = read U8; x  // Reads 2 and 3, returns 2
  ```

- **Expression-Level Bindings**: Nest let bindings inside expressions

  ```
  let temp : U8 = (read U8 + { let x : U8 = read U8; let y : U8 = x; y }) * read U8; temp
  ```

- **Variable Reuse**: Use the same variable multiple times (reads once, uses multiple times)

  ```
  let x = read U8; x + x  // Reads once, adds to itself
  ```

- **Mutable Variables**: Declare variables with `mut` to allow reassignment

  ```
  let mut x = read U8; x = read U8; x  // Reads twice, returns second value
  ```

- **Uninitialized Variables**: Declare with type annotation, assign later

  ```
  let x : I32; x = read I32; x  // Declare, assign, then use
  ```

- **Single Assignment Rule**: Uninitialized variables can only be assigned once

  ```
  let x : U8; x = read U8; x = 100; x  // Error: multiple assignments (invalid)
  ```

- **Mutable Uninitialized Variables**: Declare with `mut` and type annotation for multiple assignments

  ```
  let mut x : U8; x = read U8; x = 100; x  // Reads input, assigns 100, returns 100 (valid)
  ```

### Logical Operators

- **Logical OR**: Combine boolean expressions with the `||` operator (lowest precedence)

  ```
  read Bool || read Bool  // Returns 1 if either input is non-zero, 0 otherwise
  ```

- **Bool Type**: 8-bit integer with values 0 (false) or 1 (true)

  ```
  let x : Bool = read Bool; x  // Read a boolean value
  ```

## Supported Types

- `U8`, `U16`, `U32` - Unsigned integers (8, 16, 32 bits)
- `I8`, `I16`, `I32` - Signed integers (8, 16, 32 bits)
- `Bool` - Boolean type (0 or 1)

## Operator Precedence

Operators are evaluated in the following order (highest to lowest):

1. Multiplicative operators: `*`, `/`
2. Additive operators: `+`, `-`
3. Logical OR operator: `||`

Examples:

```
2 + 3 * 4        // = 14  (multiply first, then add)
(2 + 3) * 4      // = 20  (parentheses override precedence)
read Bool || 1   // Logical OR has lowest precedence
```

## Build & Test

```bash
# Run tests
mvn test

# Run Checkstyle
mvn checkstyle:check

# Full build with verification
mvn verify
```

## Code Quality

- Maximum file length: 500 lines (Checkstyle)
- Maximum method length: 50 lines (Checkstyle)
- All tests must pass before commits (pre-commit hook)
