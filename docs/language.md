# Tuff Language Reference

Part of the canonical architecture; see [ARCHITECTURE.md](../ARCHITECTURE.md). This describes the language that the lexer, parser, resolver, and evaluator implement. `evaluateTuff(source)` returns a number or a `TuffError`.

## Lexical rules

- Whitespace separates tokens and is otherwise ignored.
- Numbers are runs of digits. Hex, exponent, and decimal forms are not supported.
- Names are runs of letters. `let`, `mut`, `true`, `false`, `if`, `else`, `match`, and `case` are reserved, and `_` is the wildcard pattern only.
- Operators and punctuation: `+ - * / & ( ) { } = ; => _`.
- Any other character is an `UnexpectedCharacter` error at that character.

## Values

- **Number**: a finite integer. Literals that overflow to infinity are `NumericOverflow`.
- **Boolean**: `true` or `false`. Booleans are not numbers and cannot be used in arithmetic.
- **Reference**: a pointer to a binding, created with `&` or `&mut`.

The program's final value is returned as a number. A boolean becomes 1 for `true` and 0 for `false`. A reference cannot be the final value.

## Arithmetic

`+`, `-`, `*`, and `/` work on numbers. `*` and `/` bind tighter than `+` and `-`, and operators at the same level group left to right. Parentheses group.

- `1 + 2 * 3` is 7.
- `8 / 2 / 2` is 2.
- `7 / 2` is 3: division truncates toward zero.
- `(1 + 2) * 3` is 9.

There is no unary minus, and there are no comparison operators.

## Blocks and bindings

A block is zero or more statements followed by a final expression, written inside `{ }`. The whole source is also a block, without braces.

- `let NAME = expr;` binds a name for the rest of its block. `let mut NAME = expr;` also allows later assignment.
- `NAME = expr;` changes a `let mut` binding. Assigning a plain `let` binding is `ImmutableAssignment`.
- A name may be bound once per block. An inner block may shadow an outer name.
- A name is visible only in its own block. The right-hand side of a `let` cannot see the name it binds.

Examples:

- `{ let x = 2; x * x }` is 4.
- `let mut n = 1; n = n * 5; n` is 5.
- `let mut x = 0; { x = 1; 0 } + x` is 1: an inner block can change an outer `let mut` binding.

A braced block used as a value must end in an expression: `{ }` and `{ let x = 0; }` are errors. Between statements, a braced block may end in a statement, such as `{ x = 1; }`; it needs no `;`, and its value is discarded. A braced block that ends its block or source with no final expression is an error. An `if` between statements may also be a statement: `if (c) { x = 1; } else { x = 2; }` runs one branch, needs no `;`, and its branches must be statement blocks with no final expression. A source with statements but no final expression evaluates to 0. An empty source is an error.

## References

- `&x` makes a shared reference to `x`. `&mut x` makes a mutable reference, and `x` must be declared `let mut`.
- `*e` reads the value that the reference `e` points to. `e` can be a name, a parenthesized expression, or another `*`.
- `*e = value;` writes through a reference. The reference that `e` yields must be mutable. A shared reference earlier on the path, as in `*(*z) = 1`, does not block the write.
- A reference points at a live binding, so it sees later assignments.
- A reference may not leave the block that declares its binding (`ReferenceEscapes`).
- Using a reference as an arithmetic operand is `ReferenceAsValue`. Dereferencing something that is not a reference is `NotAReference`.

Examples:

- `let x = 1; let y = &x; *y` is 1.
- `let mut a = 1; let r = &mut a; *r = 9; a` is 9.
- `let x = 1; &x` is `ReferenceEscapes`.

## Conditionals

`if (condition) then else otherwise` is an expression. The condition must be a boolean (`NotABoolean` otherwise), `else` is required, and each branch is a full expression.

Both branches are resolved and evaluated, so an error in either is reported even when the other is chosen. The value comes from the chosen branch. Writes made by the unchosen branch are undone.

- `if (true) 1 else 2` is 1.
- `if (true) 2 else { 1 / 0 }` is `DivisionByZero` at the `/`.

## Match

`match (value) { case pattern => expr; ... }` selects an arm. Each arm ends with `;`. A pattern is a number, `true`, `false`, or `_`, which matches anything.

- Every arm is evaluated, so an error in any arm is reported.
- The value comes from the first arm whose pattern equals the value. Writes made by other arms are undone.
- A pattern of a different kind than the value is `TypeMismatch` at the pattern.
- Two arms may not have the same pattern (`DuplicatePattern`, reported at the later arm).
- The scrutinee must be a number or a boolean; a reference is `ReferenceAsValue`.
- When no pattern matches, the result is `NoMatchingArm` at the `match` keyword.

Examples:

- `match (true) { case true => 1; case _ => 0; }` is 1.
- `match (3) { case 1 => 1; }` is `NoMatchingArm`.

## Errors

Every error has a kind, a span, and an explanation from `describeError`, which gives what, where, why, and how to fix it. The kinds are listed in `TuffErrorKind` in `src/errors.ts`:

- Syntax: `UnexpectedCharacter`, `UnexpectedEnd`, `UnexpectedToken`, `ExpectedClosingParen`, `NestingTooDeep`, `DuplicatePattern`.
- Names: `UnknownName`, `DuplicateName`, `ImmutableAssignment`.
- Evaluation: `DivisionByZero`, `NumericOverflow`, `BooleanOperand`, `ReferenceAsValue`, `TypeMismatch`, `NotAReference`, `ReferenceEscapes`, `NotABoolean`, `NoMatchingArm`.
- Internal: `InternalError`, a bug in Tuff rather than in the source.

When a source has several errors, the first in phase order is reported: syntax and duplicate names, then unknown names, then evaluation errors.
