# Tuff

Small utility library.

## interpret

Converts a numeric string to a number. Supports various integer suffixes and basic arithmetic expressions with type consistency.

Example:

```ts
import { interpret } from "./dist/index";

console.log(interpret("100")); // 100
console.log(interpret("100U8")); // 100
console.log(interpret("2 * 4I8 + 3")); // 11
```

Supported Suffixes:

- `U8`, `U16`, `U32`, `U64` (Unsigned)
- `I8`, `I16`, `I32`, `I64` (Signed)

Rules:

- Truncates floating point numbers to integers.
- Throws error if value is out of bounds for the specified type.
- Expressions must use consistent types (only one explicit suffix type allowed per expression, mixed with unsuffixed "none" types).
- Supports addition (`+`), subtraction (`-`), multiplication (`*`), and division (`/`) with standard precedence.
- Division results are truncated toward zero (integer division).
