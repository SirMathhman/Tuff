# tuff

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.3.7. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

## Language Features

Examples supported by the interpreter:

```text
// Arrays: [Type; Initialized Elements; Length]
let mut array : [I32; 0; 3];
array[0] = 100;
fn accept(param : [I32; 1; 3]) : I32 => param[0];
accept(array) // => 100

// Functions
fn get() : I32 => 100;
get() // => 100

// Structs
struct Point { x : I32; y : I32; }
let point : Point = Point { 3, 4 };
point.x + point.y // => 7
```
