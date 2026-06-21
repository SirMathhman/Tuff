# Missing Features for Tuff to Be "Usable"

A language is _usable_ when a programmer can write non-trivial programs without fighting the compiler or workarounding fundamental gaps. Below we categorize what's missing, ordered by impact on day-to-day usability.

---

## 1. Type System & Literals (Critical)

| Feature                 | Status     | Why It Matters                                                                                                                               |
| ----------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **String literals**     | ✅ Done    | `"hello"` tokenized as `string` type, emitted via `strlit`. Property access chains work (`"test".length`).                                   |
| **Boolean literals**    | ✅ Done    | `true` / `false` are recognized by the tokenizer as keywords (type: `bool`), parsed into `boollit` AST nodes. Coerced to numbers in emitter. |
| **Null / void literal** | ❌ Missing | No concept of absence or intentional non-return. Functions that don't produce a value have no explicit type marker.                          |
| **Type annotations**    | ❌ Missing | No way to declare expected types on variables, parameters, or return values. Hinders tooling and self-documentation.                         |

## 2. I/O & Built-ins (Critical)

| Feature                        | Status     | Why It Matters                                                                                                                                                                                             |
| ------------------------------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Print / output**             | ❌ Missing | The language can `read()` but cannot _write_. A usable language needs at least one way to produce visible output (`print()`, `println()`, or similar).                                                     |
| **String concatenation**       | ⚠️ Partial | String literals exist, so `+` on strings is possible in principle. Actual string concat behavior depends on generated JS coercion.                                                                         |
| **Standard library functions** | ⚠️ Minimal | Built-ins now include: `read()`, `readBool()`, and `readString()` (reads next whitespace-separated token as a string). Still missing: length, min/max, abs, type conversion (`toString` equivalents), etc. |

## 3. Control Flow (High)

| Feature                        | Status         | Why It Matters                                                                                                                     |
| ------------------------------ | -------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Return / break / continue**  | ⚠️ Partial     | `return` keyword is implemented via the throw/catch IIFE-escape mechanism (`fn_return`). `break` and `continue` are still missing. |
| **Yield**                      | ✅ Done        | `yield` keyword allows early-return from block expressions, emitted as direct `return(...)` in generated JS.                       |
| **Match / switch expressions** | ❌ Missing     | Multi-way branching requires nested `if/else`. A pattern match or switch on values would significantly reduce boilerplate.         |
| **Do-until loops**             | ⚠️ Not present | Only `while` (pre-condition) and `for` (range). No post-condition loop for "run at least once" patterns.                           |

## 4. Expressions & Operators (High)

| Feature                                   | Status     | Why It Matters                                                                                                                                                             |
| ----------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Logical operators (`&&`, `\|\|`, `!`)** | ✅ Done    | Tokenized as `logical_or`, `logical_and`, and unary `op: "!"`. Parsed via `parseLogicalOr`/`parseLogicalAnd` in the expression parser. Short-circuit evaluation supported. |
| **Ternary / inline if**                   | ❌ Missing | No `cond ? a : b`. Must use full `if/else` statement even in expression contexts (e.g., inside function arguments).                                                        |
| **Unary minus / negation**                | ✅ Done    | Unary `-` works for numbers via tokenizer (`-3.14`) and explicit unary negation of expressions like `-(x + y)` is now parsed as `{ type: "unary", op: "-" }`.              |
| **Modulo / remainder**                    | ✅ Done    | `%` operator tokenized, parsed at mul/div/mod precedence level between add/sub and primary.                                                                                |
| **Power / exponentiation**                | ❌ Missing | No `**` or equivalent.                                                                                                                                                     |
| **Assignment expressions**                | ✅ Done    | All four compound assignments (`+=`, `-=` , `*=`, `/=`) are tokenized, parsed into `compound_assign_stmt`, and emitted generically via the `op` field.                     |

## 5. Data Structures (Medium)

| Feature                       | Status     | Why It Matters                                                                                                                                                           |
| ----------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Map / dictionary literals** | ❌ Missing | Objects exist (`{ key : value }`) but keys are identifiers only, not arbitrary expressions. No way to use dynamic or string-based keys. Essentially a struct, not a map. |
| **Array length property**     | ❌ Missing | Cannot query `arr.len` or equivalent. Must track size manually.                                                                                                          |
| **Array append / push**       | ❌ Missing | Arrays are fixed-size after creation (can mutate elements but cannot grow). No built-in to extend arrays.                                                                |
| **String operations**         | ❌ Missing | Follows from missing string type: no split, join, substring, contains, etc.                                                                                              |

## 6. Functions & Scoping (Medium)

| Feature                          | Status           | Why It Matters                                                                                                                                                                                                                     |
| -------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Closures / nested functions**  | ⚠️ Unclear       | Functions are defined at top level with `fn`. Nested function definitions inside blocks may not capture outer scope correctly — the emitter generates JS closures but validation (`validateRefs`) does not track closure captures. |
| **Anonymous / lambda functions** | ❌ Missing       | No way to pass a function as an argument or return one from another function. Blocks higher-order patterns (map, filter, reduce).                                                                                                  |
| **Default parameter values**     | ❌ Missing       | Cannot provide fallbacks for optional arguments.                                                                                                                                                                                   |
| **Varargs / rest parameters**    | ❌ Missing       | Functions have fixed arity only.                                                                                                                                                                                                   |
| **Recursion depth safety**       | ⚠️ Not addressed | Generated JS relies on native call stack; no tail-call optimization or iterative lowering. Deep recursion will crash.                                                                                                              |

## 7. Modules & Externs (Medium)

| Feature                | Status         | Why It Matters                                                                                                                                                               |
| ---------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Selective imports**  | ⚠️ Partial     | `extern let { x, y } = module` works for raw JS modules. But no equivalent for importing from other _Tuff_ modules — you must use `module::name` fully qualified everywhere. |
| **Aliasing on import** | ❌ Missing     | Cannot rename imports (`import X as Y`). Problematic with name collisions.                                                                                                   |
| **Re-exports**         | ⚠️ Not present | Can export with `out`, but cannot re-export another module's exports for facade patterns.                                                                                    |

## 8. Error Handling (Medium)

| Feature                            | Status     | Why It Matters                                                                                          |
| ---------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------- |
| **Try-catch / exception handling** | ❌ Missing | No structured error recovery. A runtime error in generated JS propagates uncaught.                      |
| **Result / Option types**          | ❌ Missing | No idiomatic way to represent fallible operations (e.g., array access out of bounds, division by zero). |
| **Panic / assert statements**      | ❌ Missing | Cannot explicitly abort with a message during development or on invariant violations.                   |

## 9. Tooling & Developer Experience (Low-Medium)

| Feature                            | Status     | Why It Matters                                                                                                                                                        |
| ---------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Comments**                       | ⚠️ Partial | Single-line comments (`//`) are not tokenized — the tokenizer will throw on `@` and likely on `/` in unexpected positions. Multi-line comments (`/* */`) also absent. |
| **Meaningful error messages**      | ⚠️ Minimal | Parser errors say "Unexpected end" or "Expected identifier" without line/column information. Hard to debug source files.                                              |
| **Type checking / inference**      | ❌ Missing | Runtime-only type system (inherited from JS). No compile-time validation of type mismatches.                                                                          |
| **Standard library documentation** | ❌ Missing | Only two built-ins exist, and they are undocumented in the repo itself.                                                                                               |

## 10. Memory & Performance (Low)

| Feature                                     | Status                | Why It Matters                                                                                                                                                                     |
| ------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Explicit memory management hints**        | ⚠️ Not applicable yet | References use a `{v: ...}` slot pattern for scalars. This is invisible to the programmer but may confuse when inspecting generated JS. No way to opt out or understand the model. |
| **Const generics / compile-time constants** | ❌ Missing            | `let` without `mut` is immutable at runtime (JS `const`), but not evaluated at compile time. Cannot use in contexts requiring constant expressions.                                |

---

## Recommended Priority Path

To reach "usable" status, address these in order:

1. **Print output** — a language that cannot produce visible results is hard to test or demonstrate
2. ~~**String literals + concatenation**~~ — ✅ Implemented (`"hello"` tokenized, `strlit` emitted)
3. ~~**Boolean literals**~~ — ✅ Implemented (`true`/`false` as keywords → `boollit`)
4. ~~**Logical operators**~~ — ✅ Implemented (`&&`, `||`, `!` with short-circuit evaluation)
5. **Break / continue** — control flow completeness (return is already done via throw/catch IIFE escape)
6. **Comments** — any real program needs documentation inline
7. **Array length + push** — dynamic collections are a basic building block
