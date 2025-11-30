# Next: Feature 3 - Control Flow

## Overview

Control flow enables conditional execution and looping, which are essential for any useful program.

## Scope: if/else and while

### 1. If/Else Statements and Expressions

- Statement form: `if (condition) { statements } else { statements }`
- Expression form: `let x = if (condition) value1 else value2;`
- Type checking: condition must be Bool
- Both branches must have compatible types

### 2. While Loops

- Syntax: `while (condition) { statements }`
- Condition must be Bool type
- Loop body can contain variable declarations, assignments, operators
- Return value: Void (loops don't produce values)

## Implementation Plan

### Phase 1: AST & Parser

- Add `ASTNodeType::IF_STMT`, `IF_EXPR`, `WHILE_STMT` to ast.h
- Add `parseIfStatement()`, `parseWhileStatement()` to parser.cpp
- Support both statement and expression forms of if
- Handle optional else clause

### Phase 2: Type Checking

- Validate condition is Bool type
- For if expressions: verify both branches have same type
- For while loops: verify no value produced

### Phase 3: Code Generation

**JavaScript:**

```javascript
// if statement
if (condition) {
  // statements
} else {
  // statements
}

// if expression
const x = condition ? trueValue : falseValue;

// while loop
while (condition) {
  // statements
}
```

**C++:**

```cpp
// if statement
if (condition) {
  // statements
} else {
  // statements
}

// if expression
auto x = condition ? trueValue : falseValue;

// while loop
while (condition) {
  // statements
}
```

### Phase 4: Testing

Test cases to implement:

- `test_if_statement.tuff` - Basic if/else statement
- `test_if_expression.tuff` - If as expression with return value
- `test_while_loop.tuff` - Basic while loop with counter
- `test_while_nested.tuff` - Nested loops
- `test_if_while_combined.tuff` - Combined control flow

## Expected Test Results

```tuff
// test_if_expression.tuff
let x = if (5 > 3) 100 else 200;
x  // Expected exit code: 100

// test_while_loop.tuff
let i = 0;
while (i < 5) {
  i = i + 1;
}
i  // Expected exit code: 5

// test_nested.tuff
let sum = 0;
let i = 0;
while (i < 5) {
  let j = 0;
  while (j < 3) {
    sum = sum + 1;
    j = j + 1;
  }
  i = i + 1;
}
sum  // Expected exit code: 15 (5 * 3)
```

## Pre-requisites Completed

✅ Feature 1: Variables & Let Bindings
✅ Feature 2: Primitive Operations (including Bool type and comparison operators)

## Critical Notes

- Control flow is a prerequisite for a self-hosting compiler
- Current limitations: No break/continue (can defer to later)
- No statement separators in blocks needed (Tuff uses newlines/semicolons optionally)
- Scoping must handle variable shadowing within if/while blocks
