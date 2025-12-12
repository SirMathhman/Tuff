# Tuff

This repo contains a self-hosting compiler that compiles `.tuff` source files to JavaScript **ES Modules**.

## Dev

- Run tests: `bun test`
- Rebuild prebuilt compiler: `bun run build:selfhost-prebuilt`

## Status

The compiler is self-hosting and implements a small but growing subset of the language described in `LANGUAGE.md`.

## Tuff-written unit testing helpers

There is a tiny, dependency-free unit testing helper module written in Tuff at `src/main/tuff/std/test.tuff`.

Example:

```tuff
from std::test use { reset, it, expect_eq, expect, summary, status };

fn main() => {
	reset();

	it("math works", expect_eq("1+1", 1 + 1, 2));
	it("truth", expect("2==2", 2 == 2));

	summary();
	status() // 0 when all passed, 1 if any failed
}
```
