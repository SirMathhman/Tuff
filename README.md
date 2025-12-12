# Tuff (bootstrap compiler)

This repo contains an early bootstrap compiler that compiles `.tuff` source files to JavaScript **ES Modules**.

## Dev

- Run tests: `bun test`
- Compile a file: `bun run src/cli.ts path/to/file.tuff --outdir out`

## Status

This is a bootstrap compiler: it implements a small but growing subset of the language described in `LANGUAGE.md`.

## Tuff-written unit testing helpers

There is a tiny, dependency-free unit testing helper module written in Tuff at `std/test.tuff`.

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
