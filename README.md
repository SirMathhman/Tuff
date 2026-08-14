# Tuff

A small TypeScript project on [Bun](https://bun.com).

## API

Exports a single function:

```ts
export function evaluate(input: string): number
```

- `evaluate("")` returns `0`.
- Any other input throws an `Error` (`evaluate: unsupported input: ...`).

## Tests

Run the tests with:

```bash
bun test
```
