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

### Blocks and `yield`

You can use a scoped block as the initializer of a `let` binding. Inside the block, `yield <expr>` sets the block's value.

```
let x : U8 = { yield read U8; }; x
```

You can also conditionally `yield` early; if no `yield` runs, the final expression becomes the block result.

```
let x = { if (read Bool) yield 100; 200 }; x
```

### Logical Operators

- **Logical OR**: Combine boolean expressions with the `||` operator (lowest precedence)

  ```
  read Bool || read Bool  // Returns 1 if either input is non-zero, 0 otherwise
  ```

- **Logical AND**: Combine boolean expressions with the `&&` operator (higher precedence than OR)

  ```
  read Bool && read Bool  // Returns 1 if both inputs are non-zero, 0 otherwise
  ```

- **Bool Type**: 8-bit integer with values 0 (false) or 1 (true)

  ```
  let x : Bool = read Bool; x  // Read a boolean value
  ```

### Comparison Operators

All comparison operators return a boolean value (1 for true, 0 for false):

- **Equality**: `==` - Tests if two values are equal

  ```
  read U32 == read U32  // Returns 1 if equal, 0 otherwise
  ```

- **Inequality**: `!=` - Tests if two values are not equal

  ```
  read U32 != read U32  // Returns 1 if not equal, 0 otherwise
  ```

- **Less Than**: `<` - Tests if left is less than right

  ```
  read U8 < read U8  // Returns 1 if left < right, 0 otherwise
  ```

- **Greater Than**: `>` - Tests if left is greater than right

  ```
  read U8 > read U8  // Returns 1 if left > right, 0 otherwise
  ```

- **Less or Equal**: `<=` - Tests if left is less than or equal to right

  ```
  read U32 <= read U32  // Returns 1 if left <= right, 0 otherwise
  ```

- **Greater or Equal**: `>=` - Tests if left is greater than or equal to right

  ```
  read U32 >= read U32  // Returns 1 if left >= right, 0 otherwise
  ```

### Conditional Expressions

Execute one of two expressions based on a boolean condition:

- **Basic If-Else**: Use `if (condition) trueBranch else falseBranch` syntax

  ```
  if (read Bool) 3 else 5  // Read boolean, return 3 if true, 5 if false
  ```

- **If-Else with Comparisons**: Combine conditionals with comparison operators

  ```
  if (read U8 > read U8) 100 else 50  // Return 100 if first > second, else 50
  ```

- **If-Else in Let Bindings**: Use conditionals within variable assignments

  ```
  let x = if (read Bool) 100 else 50; x  // Bind conditional result to variable
  ```

## Supported Types

- `U8`, `U16`, `U32` - Unsigned integers (8, 16, 32 bits)
- `I8`, `I16`, `I32` - Signed integers (8, 16, 32 bits)
- `Bool` - Boolean type (0 or 1)

## Operator Precedence

Operators are evaluated in the following order (highest to lowest):

1. Multiplicative operators: `*`, `/`
2. Additive operators: `+`, `-`
3. Comparison operators: `==`, `!=`, `<`, `>`, `<=`, `>=`
4. Logical AND operator: `&&`
5. Logical OR operator: `||`

Examples:

```
2 + 3 * 4              // = 14  (multiply first, then add)
(2 + 3) * 4            // = 20  (parentheses override precedence)
read U8 > 5 && 1       // Comparison before AND
if (read Bool) 3 else 5 // Conditionals at expression level
```

## Build & Test

```bash
# Run tests
mvn test

# Run Checkstyle (recommended)
#
# Note: the Checkstyle configuration uses custom checks defined in this project.
# Running `mvn verify` will build and install the project artifact into your local
# Maven repository before executing Checkstyle.
mvn verify

# (Optional) If you want to run Checkstyle as a standalone goal:
# mvn -DskipTests install
# mvn checkstyle:check

# Full build with verification
mvn verify
```

## Code Quality

- Maximum file length: 500 lines (Checkstyle)
- Maximum method length: 50 lines (Checkstyle)
- Maximum parameters per method/constructor: 5 (Checkstyle)
- Maximum record components: 5 (Checkstyle)
- Maximum classes per package: 15 (Python pre-commit hook)
- All tests must pass before commits (pre-commit hook)

### Package Structure Enforcement

The codebase enforces a maximum of 15 classes per package using a Python pre-commit hook. This ensures packages remain focused and maintainable.

**Current package distribution:**

- `io.github.sirmathhman.tuff`: 7 classes (Core types and error handling)
- `io.github.sirmathhman.tuff.compiler`: 12 classes (Expression parsing and compilation)
- `io.github.sirmathhman.tuff.vm`: 4 classes (Virtual machine and instructions)

The checker runs automatically on commits and will fail if any package exceeds 15 classes. To test it manually:

```bash
python.exe check_package_class_limit.py
```
