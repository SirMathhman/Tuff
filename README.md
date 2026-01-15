# Tuff

A sophisticated numeric expression interpreter with fixed-width integer types, scoped variables, type safety, control flow, and closures.

## Features

- **Fixed-width Integer Types**: Supports `U8`, `U16`, `U32`, `U64`, `I8`, `I16`, `I32`, `I64`.
- **Operator Precedence**: Correctly handles `*`, `/`, `%` before `+`, `-`.
- **Recursive Expressions**: Supports nested parentheses `()` and curly brace blocks `{}`.
- **Variable Declarations**: Block-scoped variables using `let x : Type = value;` or implicit inference `let x = value;`.
- **Type Safety**:
  - Prevents re-declaration of variables in the same scope.
  - Blocks implicit narrowing assignments (e.g., cannot assign `U16` to `U8`).
  - Strict overflow checking for all operations.
- **Control Flow**:
  - `if/else` expressions and statements
  - `for` loops with range syntax: `for(let mut i in 0..10) { ... }`
  - `while` and `do-while` loops
  - `match` expressions with pattern matching
  - `break` and `continue` statements for loop control
- **Functions**: First-class functions with closures and local scopes
- **Advanced Types**: Type aliases, union types, struct support
- **Generators**: `yield` expressions for generator-like behavior

## Usage

````typescript
import { interpret } from "./src/interpret";

// Basic expressions
interpret("(2 + { let x = 4; x }) * 3"); // Returns 18

// Type safety
interpret("let x = 255U8; x + 1"); // Throws Overflow error

// Loop control
interpret("let mut sum = 0; for(let mut i in 0..10) { if(i == 5) break; sum += i }; sum"); // Returns 10

// Continue statements
interpret("let mut sum = 0; for(let mut i in 0..10) { if(i % 2 == 0) continue; sum += i }; sum"); // Returns 25

// Functions and closures
interpret("let add = fn(a, b) { a + b }; add(3, 4)"); // Returns 7
## Setup

```bash
npm install
npm test
````
