# Tuff

A sophisticated numeric expression interpreter with fixed-width integer types, scoped variables, and type safety.

## Features

- **Fixed-width Integer Types**: Supports `U8`, `U16`, `U32`, `U64`, `I8`, `I16`, `I32`, `I64`.
- **Operator Precedence**: Correctly handles `*`, `/`, `%` before `+`, `-`.
- **Recursive Expressions**: Supports nested parentheses `()` and curly brace blocks `{}`.
- **Variable Declarations**: Block-scoped variables using `let x : Type = value;` or implicit inference `let x = value;`.
- **Type Safety**:
  - Prevents re-declaration of variables in the same scope.
  - Blocks implicit narrowing assignments (e.g., cannot assign `U16` to `U8`).
  - Strict overflow checking for all operations.

## Usage

```typescript
import { interpret } from './src/interpret';

interpret("(2 + { let x = 4; x }) * 3"); // Returns 18
interpret("let x = 255U8; x + 1"); // Throws Overflow error
```

## Setup

```bash
npm install
npm test
```
