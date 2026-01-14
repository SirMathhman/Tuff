# Tuff - interpret

Adds a simple TypeScript function `interpret(input: string): number` that parses a numeric value from the start of the input string and returns it. If the input doesn't start with a number, it throws an error (for example, `interpret("100U8")` returns `100`).

Run tests:

```bash
npm install
npm test
```
