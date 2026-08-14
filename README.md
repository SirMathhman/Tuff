# tuff

Tuff is a language interpreter written in TypeScript with Bun.

## API

### `interpret(input: string): number`

Takes a string input with arithmetic operations (`+`, `-`, `*`, `/`) and grouping delimiters — parentheses (`(`, `)`) and curly braces (`{`, `}`) — and returns the resulting number.
Multiplication (`*`) and division (`/`) have higher precedence than addition (`+`) and subtraction (`-`).
Parentheses and curly braces can be used to override the default operator precedence.

#### Variables

Inside `{}` blocks, you can declare variables using `let`:

```
{let x = 5; x + 3}
```

Variables are scoped to the block in which they are declared and can be referenced by name in subsequent expressions within the same block.

You can also use `let` at the top level (outside of any block):

```
let y = { let x = 2 + 3; x } * 4; y
```

This returns `20`.

#### Tests

Run the test suite with:

```bash
bun test
```

## Installation

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.3.14. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
