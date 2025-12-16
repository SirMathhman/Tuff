# Tuff Standard Library

The Tuff standard library provides core data structures, utilities, and I/O abstractions.

## Modules

| Module             | Purpose                                                                                                                               | Exports                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **`prelude.tuff`** | Core types and utilities automatically imported by all programs. Includes common type aliases, helper functions, and builtin interop. | Common types, constructors, utility functions                        |
| **`test.tuff`**    | Unit testing framework for pure Tuff. Provides test runner, assertions, and test result aggregation.                                  | `reset()`, `suite()`, `it()`, `expect_eq()`, `summary()`, `status()` |
| **`iter.tuff`**    | Iterator and sequence utilities (planned): `map`, `filter`, `fold`, lazy evaluation chains.                                           | (TBD)                                                                |

## Module Descriptions

### `prelude.tuff`

Automatically imported. Provides:

- **Type aliases** — `Option<T>`, `Result<T, E>`, `List<T>`
- **Constructors** — `Some()`, `None`, `Ok()`, `Err()`
- **Common functions** — type checks, error handling
- **I/O stubs** — `print()`, `read_line()` (extern wrappers to JavaScript runtime)

Example usage:

```tuff
from std::io use { print };

fn main() : I32 => {
    print("Hello, world!\n");
    0
}
```

### `test.tuff`

Pure Tuff testing framework. Accumulates test results and reports pass/fail status.

API:

- **`reset()`** — Reset test counter
- **`suite(name: String)`** — Define test suite
- **`it(description: String, result: I32)`** — Record test result (0 = pass, 1 = fail)
- **`expect_eq(description: String, actual: T, expected: T) : I32`** — Assertion helper; returns 0 if equal, 1 otherwise
- **`summary()`** — Print summary (passed/failed counts)
- **`status() : I32`** — Return 0 if all tests passed, 1 if any failed

Example test:

```tuff
from std::test use { reset, suite, it, expect_eq, summary, status };

fn main() : I32 => {
  reset();
  suite("arithmetic");

  it("addition", expect_eq("1 + 1", 1 + 1, 2));
  it("subtraction", expect_eq("5 - 3", 5 - 3, 2));

  summary();
  status()
}
```

Run test:

```bash
node selfhost/prebuilt/tuffc.mjs my_test.tuff my_test.mjs
node my_test.mjs
```

### `iter.tuff` (Planned)

Future iterator library providing functional sequence operations:

```tuff
from std::iter use { map, filter, fold };

// Example (future):
let result = [1, 2, 3]
  |> map(|x| x * 2)
  |> filter(|x| x > 2)
  |> fold(0, |acc, x| acc + x);
```

## FFI and Runtime Integration

Standard library functions that interact with the JavaScript runtime use `extern`:

```tuff
extern fn print(s: String) : Void;
extern fn read_line() : String;
```

These are resolved at emission time; the emitter generates JavaScript that calls the runtime functions directly.

## Standard Library Expansion (Roadmap)

Future phases will add:

- **Iterators and functional combinators** (`iter.tuff`)
- **String manipulation** (`string.tuff`)
- **Collections** (`vec.tuff` for resizable arrays, `map.tuff` for dictionaries)
- **File I/O** (`fs.tuff`)
- **Module system utilities** (`module.tuff`)
- **Reflection and introspection** (`reflect.tuff`)

See [`TASKS.md`](../../TASKS.md "../../TASKS.md") for long-term roadmap.
