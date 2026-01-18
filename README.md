# Tuff

This project contains a small interpreter (`interpret`) and a compiler (`compile` + `execute`) for the Tuff expression language.

## Code generation (no runtime mini-interpreter)

`src/codeGen.ts` compiles Tuff source into straightforward JavaScript:

- `read<T>()` calls are replaced with `values[i]` placeholders during compilation.
- Expressions are parsed **at compile time** and emitted as plain JS expressions.
- Semantics are preserved where they differ from JavaScript:
  - integer division uses `Math.floor(a / b)`
  - comparisons and logical operators yield `1`/`0`
  - unary `!` yields `1` when the operand is `0`, else `0`

This keeps generated programs tiny and makes debugging emitted code much easier.
