# Tuff Language — Semantic Gaps

## 1. Missing Operators

| Gap                                                     | Impact                                                                                                                                                                               |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Unary `-` (negation)**                                | Can't write `-x` or `--5`. The test `test_negative_u8_literal_error` confirms `-100U8` errors, and there's no unary minus path in `parse_factor`. You must work around with `0 - x`. |
| **Unary `!` (logical NOT)**                             | No way to negate a boolean. Can't write `!(x > 5)` — you'd need `x <= 5` manually. Given `&&`, `\|\|`, and comparison ops exist, this is conspicuous.                                |
| **Modulo `%`**                                          | Standard arithmetic operator missing from the term level alongside `*` and `/`.                                                                                                      |
| **Bitwise operators** (`&`, `\|`, `^`, `~`, `<<`, `>>`) | The language has typed integers (U8–I32) but no bitwise ops — unusual for a type-focused numeric language.                                                                           |

## 2. Missing Control Flow

| Gap                      | Impact                                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`break` / `continue`** | Loops (`while`, `for`) have no early exit or skip mechanism. Can't implement "loop until condition mid-body" without a flag variable workaround. |
| **`else if` chaining**   | Not syntactically supported — requires nested `if` statements which is verbose and error-prone for multi-way branching.                          |

## 3. Type System Weaknesses

| Gap                                             | Impact                                                                                                                                                                                                                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **No runtime type enforcement**                 | Types are tracked as metadata only; all values remain raw `i64`. A U8 variable can hold any i64 value — the range check only fires at literal parse time, not on assignment or arithmetic result. Adding two U8s that overflow 255 silently produces a wrong-typed value. |
| **No overflow protection**                      | Arithmetic never checks bounds. `200U8 + 100U8` = 300 with no error, even though the promoted type would suggest bounded semantics.                                                                                                                                       |
| **Type annotations don't constrain assignment** | After declaring `let x : U8 = 5;`, you can assign any i64 to `x` via mutation — the declared type is forgotten for subsequent assignments.                                                                                                                                |

## 4. Missing Data Features

| Gap                               | Impact                                                                                                                                        |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **No string type or literals**    | The language is purely numeric with no way to represent text. Error messages are compiler-side only; a program can't produce its own strings. |
| **No comments** (`//` or `/* */`) | No way to annotate source code. For anything beyond toy programs this hurts maintainability.                                                  |
| **Struct field assignment**       | Can read `s.field` but cannot write `s.field = value`. Struct fields are effectively immutable after creation, even with `let mut`.           |
| **No array append/resize**        | Arrays have fixed length after creation (except element reassignment). No `.push()`, concatenation, or slicing.                               |

## 5. Function Limitations

| Gap                                              | Impact                                                                                                                                                                                                      |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Structs/arrays as function params pass by ID** | When a struct field contains an anonymous reference (negative ID), passing it to a function sends the raw negative number — not the resolved value. The callee gets `-1` instead of meaningful data.        |
| **No return statement**                          | Functions are single-expression only (`fn f() => expr;`). Can't have early returns or multi-statement bodies with explicit return values (though this is somewhat mitigated by expression-oriented design). |

## 6. Match Expression Limitations

| Gap                     | Impact                                                                                                                                                                  |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **No pattern matching** | `match` only does equality comparison against literal values. No range patterns (`1..=5`), no destructuring, no guard clauses — just exact value match or wildcard `_`. |
