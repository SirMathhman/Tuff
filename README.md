# tuff

Tuff is a language interpreter written in TypeScript with Bun.

## API

### `interpret(input: string): number`

Takes a string input with arithmetic operations (`+`, `-`, `*`, `/`) and returns the resulting number.
Multiplication (`*`) and division (`/`) have higher precedence than addition (`+`) and subtraction (`-`).

## Tests

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
