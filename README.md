# tuff

## Language features (interpreter)

- Numeric types with bounds checking (e.g. `100U8`, `-5I32`)
- Booleans (`true`/`false`) and boolean ops (`&&`, `||`)
- `let` / `let mut` bindings and reassignment rules
- Blocks `{ ... }`, `if` / `else`, `while`, `for (let mut i in a..b)`
- Tuples `(a, b, ...)` and indexing `tuple[0]`
- References (`&`, `&mut`, `*`) with borrow rules
- Functions:
  - Declaration: `fn get() : I32 => 100;`
  - Parameters: `fn pass(value : I32) => value; pass(100)`
  - Multiple parameters: `fn add(first : I32, second : I32) : I32 => first + second; add(3, 4)`
  - Method call with `this`: `fn add(this : I32, second : I32) : I32 => this + second; 3.add(4)`
  - Call: `get()`
  - Function values: `let f : () => I32 = fn get() : I32 => 100; f()`

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.3.6. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
