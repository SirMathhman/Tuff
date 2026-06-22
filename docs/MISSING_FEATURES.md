# Missing Features for Tuff to Be "Usable"

A language is _usable_ when a programmer can write non-trivial programs without fighting the compiler or workarounding fundamental gaps. Below we categorize what's missing, ordered by impact on day-to-day usability.

---

## 1. Type System & Literals (Critical)

| Feature                                   | Status     | Why It Matters                                                                                                                                |
| ----------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Compile-time type checking**            | ⚠️ Partial | Widening allowed (U8→U16, I8→I32), narrowing rejected, Bool-to-int mismatch caught. Call argument types validated against param declarations. |
| **Full integer width coverage (U64/I64)** | ❌ Missing | Only up to 32-bit types implemented; larger widths would require BigInt in generated JS.                                                      |
| **Float / decimal literals**              | ❌ Missing | No `f32`/`f64` or floating-point suffixes (`1.5F32`). All arithmetic is integer-only, blocking any fractional math.                           |
| **Enum types**                            | ❌ Missing | Named sets of values (e.g., `enum Color { Red, Green, Blue }`) for readable constants and exhaustive matching.                                |
| **Struct / named tuple types**            | ❌ Missing | No way to define reusable composite types with typed fields beyond inline object literals.                                                    |
| **Type aliases**                          | ❌ Missing | Cannot write `type Id = U32` — repeated union annotations (`U8 \| I32`) are verbose and error-prone.                                          |
| **Generic type parameters**               | ❌ Missing | Functions cannot be parameterized by type (e.g., `fn identity<T>(x : T) => x`). Generic utilities require code duplication.                   |
| **Overflow checking**                     | ❌ Missing | No compile-time or runtime guard against integer overflow/underflow on typed values (`255U8 + 1U8` silently wraps).                           |

## 2. I/O & Built-ins (Critical)

| Feature                        | Status     | Why It Matters                                                                                                                                                                                             |
| ------------------------------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Print / output**             | ❌ Missing | The language can `read()` but cannot _write_. A usable language needs at least one way to produce visible output (`print()`, `println()`, or similar).                                                     |
| **String concatenation**       | ⚠️ Partial | String literals exist, so `+` on strings is possible in principle. Actual string concat behavior depends on generated JS coercion.                                                                         |
| **Standard library functions** | ⚠️ Minimal | Built-ins now include: `read()`, `readBool()`, and `readString()` (reads next whitespace-separated token as a string). Still missing: length, min/max, abs, type conversion (`toString` equivalents), etc. |
| **File I/O**                   | ❌ Missing | Cannot read from or write to files. All input must come via stdin tokens; no persistence between runs.                                                                                                     |
| **Environment variables**      | ❌ Missing | No access to `env::get("KEY")` or similar for configuration without hardcoding values.                                                                                                                     |
| **Random number generation**   | ❌ Missing | No built-in `rand()` or `randRange(min, max)`. Games, simulations, and tests requiring nondeterminism must be implemented manually.                                                                        |
| **Time / clock access**        | ❌ Missing | Cannot query current timestamp, measure elapsed time, or sleep/delay execution. Benchmarking and timed behavior are impossible.                                                                            |

## 3. Control Flow (High)

| Feature                        | Status     | Why It Matters                                                                                                             |
| ------------------------------ | ---------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Match / switch expressions** | ❌ Missing | Multi-way branching requires nested `if/else`. A pattern match or switch on values would significantly reduce boilerplate. |
| **Do-until loops**             | ❌ Missing | Only `while` (pre-condition) and `for` (range). No post-condition loop for "run at least once" patterns.                   |
| **Goto / labels**              | ❌ Missing | Cannot jump to named labels or break out of nested control structures by label.                                            |
| **Nested loop breaking**       | ❌ Missing | `break` only exits the innermost loop; no way to break from multiple levels at once without flags or guards.               |

## 4. Expressions & Operators (High)

| Feature                    | Status     | Why It Matters                                                                                                      |
| -------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------- |
| **Ternary / inline if**    | ❌ Missing | No `cond ? a : b`. Must use full `if/else` statement even in expression contexts (e.g., inside function arguments). |
| **Power / exponentiation** | ❌ Missing | No `**` or equivalent.                                                                                              |
| **Bitwise operators**      | ❌ Missing | Cannot do bitwise AND/OR/XOR/NOT (`&`, `\|`, `^`, `~`) or shifts (`<<`, `>>`). Bit manipulation is impossible.      |
| **Increment / decrement**  | ❌ Missing | No `++` or `--`. Must write verbose `x += 1` instead of idiomatic counter syntax.                                   |
| **Spread operator**        | ❌ Missing | Cannot flatten arrays (`[...a, ...b]`) or object properties into new literals.                                      |

## 5. Data Structures (Medium)

| Feature                       | Status     | Why It Matters                                                                                                                                                           |
| ----------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Map / dictionary literals** | ❌ Missing | Objects exist (`{ key : value }`) but keys are identifiers only, not arbitrary expressions. No way to use dynamic or string-based keys. Essentially a struct, not a map. |
| **Array append / push**       | ❌ Missing | Arrays are fixed-size after creation (can mutate elements but cannot grow). No built-in to extend arrays.                                                                |
| **String operations**         | ❌ Missing | Follows from missing string type: no split, join, substring, contains, etc.                                                                                              |
| **Array slicing / views**     | ⚠️ Partial | Range syntax (`arr[1..3]`) exists for ref creation but not as a standalone expression returning a new sub-array.                                                         |
| **Tuple types & literals**    | ❌ Missing | No `(a, b)` tuple construction or destructuring. Multi-value returns require wrapping in objects manually.                                                               |
| **Nested array mutation**     | ⚠️ Partial | 2D arrays (`arr[i][j]`) work via chained index access but lack dedicated syntax for row/column semantics.                                                                |

## 6. Functions & Scoping (Medium)

| Feature                          | Status           | Why It Matters                                                                                                                                                                                                                     |
| -------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Closures / nested functions**  | ⚠️ Unclear       | Functions are defined at top level with `fn`. Nested function definitions inside blocks may not capture outer scope correctly — the emitter generates JS closures but validation (`validateRefs`) does not track closure captures. |
| **Anonymous / lambda functions** | ❌ Missing       | No way to pass a function as an argument or return one from another function. Blocks higher-order patterns (map, filter, reduce).                                                                                                  |
| **Default parameter values**     | ❌ Missing       | Cannot provide fallbacks for optional arguments.                                                                                                                                                                                   |
| **Varargs / rest parameters**    | ❌ Missing       | Functions have fixed arity only.                                                                                                                                                                                                   |
| **Recursion depth safety**       | ⚠️ Not addressed | Generated JS relies on native call stack; no tail-call optimization or iterative lowering. Deep recursion will crash.                                                                                                              |
| **Function overloading**         | ❌ Missing       | Cannot define multiple `fn` with the same name and different signatures. Polymorphic APIs require distinct names.                                                                                                                  |
| **Mutual recursion**             | ⚠️ Unclear       | Forward references between functions may not resolve correctly since declarations are processed sequentially.                                                                                                                      |

## 7. Modules & Externs (Medium)

| Feature                   | Status     | Why It Matters                                                                            |
| ------------------------- | ---------- | ----------------------------------------------------------------------------------------- |
| **Aliasing on import**    | ❌ Missing | Cannot rename imports (`import X as Y`). Problematic with name collisions.                |
| **Re-exports**            | ❌ Missing | Can export with `out`, but cannot re-export another module's exports for facade patterns. |
| **Circular dependencies** | ⚠️ Unclear | No documented resolution strategy when modules reference each other transitively.         |

## 8. Error Handling (Medium)

| Feature                            | Status     | Why It Matters                                                                                          |
| ---------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------- |
| **Try-catch / exception handling** | ❌ Missing | No structured error recovery. A runtime error in generated JS propagates uncaught.                      |
| **Result / Option types**          | ❌ Missing | No idiomatic way to represent fallible operations (e.g., array access out of bounds, division by zero). |
| **Panic / assert statements**      | ❌ Missing | Cannot explicitly abort with a message during development or on invariant violations.                   |
| **Stack traces in generated JS**   | ❌ Missing | Runtime errors lack source-level line numbers; debugging relies on inspecting opaque emitted code.      |

## 9. Tooling & Developer Experience (Low-Medium)

| Feature                            | Status     | Why It Matters                                                                                                                               |
| ---------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Comments**                       | ❌ Missing | Single-line comments (`//`) and multi-line comments (`/* */`) are not tokenized — the tokenizer will throw on `/` as an unexpected operator. |
| **Meaningful error messages**      | ⚠️ Minimal | Parser errors say "Unexpected end" or "Expected identifier" without line/column information. Hard to debug source files.                     |
| **Standard library documentation** | ❌ Missing | Built-ins include `read()`, `readBool()`, and `readString()` — undocumented in the repo itself.                                              |
| **REPL / interactive mode**        | ❌ Missing | No way to evaluate Tuff expressions interactively; all testing requires writing full source + compile cycle.                                 |
| **Source map generation**          | ❌ Missing | Generated JS has no mapping back to original Tuff line/column, making runtime debugging nearly impossible.                                   |

## 10. Memory & Performance (Low)

| Feature                                     | Status                | Why It Matters                                                                                                                                                                     |
| ------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Explicit memory management hints**        | ⚠️ Not applicable yet | References use a `{v: ...}` slot pattern for scalars. This is invisible to the programmer but may confuse when inspecting generated JS. No way to opt out or understand the model. |
| **Const generics / compile-time constants** | ❌ Missing            | `let` without `mut` is immutable at runtime (JS `const`), but not evaluated at compile time. Cannot use in contexts requiring constant expressions.                                |
| **Bounds checking configuration**           | ⚠️ Unclear            | Array out-of-bounds access behavior depends on JS engine; no explicit opt-in/opt-out for strict vs relaxed bounds validation.                                                      |

---

## Recommended Priority Path

To reach "usable" status, address these in order:

1. **Print output** — a language that cannot produce visible results is hard to test or demonstrate
2. **Comments** — any real program needs documentation inline
3. **Array push** — dynamic collections are a basic building block
