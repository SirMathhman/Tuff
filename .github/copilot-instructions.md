# Tuff AI Coding Instructions

Tuff is a lightweight expression interpreter with support for typed literals (U8, I32, etc.) and scoped blocks.

## Big Picture Architecture

- **Interpreter Entry Point**: [src/index.ts](../src/index.ts) provides the `interpret` function.
- **Result Pattern**: All interpret-related functions must return a `Result<T, E>`. `Success<T>` includes `hasSuffix: boolean`, and optional `suffixType: string` ('U'|'I') and `bitDepth: number`. Use the `ok` property to check for success.
- **Recursive Processing**: Logic flows from `interpret` → `tryOps` (binary ops) → `tryWrap` (parentheses/blocks) → `interpretOperand` (literals/variables).
- **Environment Management**: Scoping is handled by copying the `Map<string, Variable>` environment at block boundaries (`{ ... }`) in `handleBlock`.

## Technical Conventions

- **Numeric Suffixes**: Support `U<depth>` (unsigned) and `I<depth>` (signed) suffixes. Validation is done using `bigint` for exact range checks in `isInRange`.
- **Precedence**: `tryOps` handles `+` and `-` before `*` and `/` to enforce lower precedence (as it splits the expression at the lowest precedence operator first).
- **Statement Parsing**: Blocks use `;` as a delimiter. The last statement in a block defines the block's value.
- **Variable Declaration**: `let <name>[: <type>] = <expr>` is used for variable binding in [handleLet](../src/index.ts#L104).
- **Binary Operation Strictness**: Binary operations involving two suffixed operands require matching `suffixType` and `bitDepth`.

## Development Workflows

- **Testing**: Use `vitest`. Add edge cases for range overflows and type mismatches in [src/index.test.ts](../src/index.test.ts).
- **Commands**:
  - Run tests: `pnpm test`
  - Lint code: `pnpm lint`

## Example Pattern: Adding a New Operator

1. Update `tryOps` to include the new operator in a precedence group.
2. Update `applyOperator` in [src/index.ts](../src/index.ts) to implement the logic.
3. Ensure the operator handles suffix propagation and range validation (see `handleBinaryExpression`).

## Specific Helpers

- Use `failIf(condition, errorString)` for concise error returns.
- Use `cut(str, start, end)` and `part(str, start)` for whitespace-trimmed substring operations.
