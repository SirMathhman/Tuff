# Missing Language Features

Comparison of Tuff against Rust, TypeScript, and Kotlin.

Legend: ✅ Supported · ❌ Missing · ⚠️ Partial

## 1. Primitive Types

| Feature                  | Tuff | Rust | TypeScript | Kotlin |
|--------------------------|------|------|------------|--------|
| Signed integers (i8–i32) | ✅   | ✅   | ❌ (all numbers) | ✅ |
| Unsigned integers (u8–u16) | ✅ | ✅   | ❌         | ❌ |
| Booleans                 | ✅   | ✅   | ✅         | ✅ |
| Floating point (f32, f64) | ❌ | ✅   | ✅ (number) | ✅ |
| Characters               | ❌   | ✅   | ✅ (string) | ✅ |
| Strings                  | ❌   | ✅   | ✅         | ✅ |
| Unit / Void              | ❌   | ✅   | ✅         | ✅ |
| Nullable / Option        | ❌   | ✅   | ✅ (undefined/null) | ✅ |

## 2. Composite Types

| Feature                  | Tuff | Rust | TypeScript | Kotlin |
|--------------------------|------|------|------------|--------|
| Fixed-length arrays      | ✅   | ✅   | ✅         | ✅ |
| Dynamic arrays / Vec     | ❌   | ✅   | ✅         | ✅ |
| Structs                  | ✅   | ✅   | ✅         | ✅ |
| Enums                    | ❌   | ✅   | ❌         | ✅ |
| Unions / Discriminated unions | ❌ | ✅ | ✅ | ✅ |
| Tuples                   | ❌   | ✅   | ✅         | ✅ |
| Maps / Hash tables       | ❌   | ✅   | ✅         | ✅ |
| Sets                     | ❌   | ✅   | ✅         | ✅ |
| Generics                 | ❌   | ✅   | ✅         | ✅ |

## 3. Type System

| Feature                  | Tuff | Rust | TypeScript | Kotlin |
|--------------------------|------|------|------------|--------|
| Type annotations         | ✅   | ✅   | ✅         | ✅ |
| Type inference           | ✅   | ✅   | ✅         | ✅ |
| Type aliases             | ✅   | ✅   | ✅         | ✅ |
| Runtime type checks (`is`) | ✅ | ✅   | ✅         | ✅ |
| Casting                  | ✅   | ✅   | ✅         | ✅ |
| Traits / Interfaces      | ❌   | ✅   | ✅         | ✅ |
| Type promotion           | ✅   | ✅   | ❌         | ✅ |
| Null safety              | ❌   | ✅   | ✅ (strict null) | ✅ |
| Pattern matching         | ❌   | ✅   | ❌         | ✅ |

## 4. Control Flow

| Feature                  | Tuff | Rust | TypeScript | Kotlin |
|--------------------------|------|------|------------|--------|
| if / else                | ✅   | ✅   | ✅         | ✅ |
| if as expression         | ✅   | ✅   | ❌ (ternary only) | ✅ |
| while loops              | ✅   | ✅   | ✅         | ✅ |
| for-in (range)           | ✅   | ✅   | ✅         | ✅ |
| for-in (collection)      | ❌   | ✅   | ✅         | ✅ |
| break / continue         | ✅   | ✅   | ✅         | ✅ |
| Labeled break/continue   | ❌   | ✅   | ✅         | ✅ |
| match / switch           | ❌   | ✅   | ✅         | ✅ |
| when (Kotlin)            | ❌   | ❌   | ❌         | ✅ |
| try / catch              | ❌   | ❌ (Result) | ✅ | ✅ |
| Exceptions               | ❌   | ❌   | ✅         | ✅ |
| Return statements        | ❌   | ✅   | ✅         | ✅ |

## 5. Functions

| Feature                  | Tuff | Rust | TypeScript | Kotlin |
|--------------------------|------|------|------------|--------|
| Function definitions     | ✅   | ✅   | ✅         | ✅ |
| Function calls           | ✅   | ✅   | ✅         | ✅ |
| Function references      | ✅   | ✅   | ✅         | ✅ |
| Closures                 | ❌   | ✅   | ✅         | ✅ |
| Lambdas                  | ❌   | ✅   | ✅         | ✅ |
| Named parameters         | ❌   | ❌   | ❌         | ✅ |
| Default parameters       | ❌   | ❌   | ✅         | ✅ |
| Variadic arguments       | ❌   | ✅   | ✅         | ✅ |
| Overloading              | ❌   | ❌   | ✅         | ✅ |
| Tail recursion           | ❌   | ✅   | ❌         | ✅ |
| Inline functions         | ❌   | ✅   | ❌         | ✅ |
| Extension functions      | ❌   | ❌   | ❌         | ✅ |

## 6. Memory and References

| Feature                  | Tuff | Rust | TypeScript | Kotlin |
|--------------------------|------|------|------------|--------|
| References (`&x`)        | ✅   | ✅   | ❌         | ❌ |
| Mutable references       | ✅   | ✅   | ❌         | ❌ |
| Dereference (`*x`)       | ✅   | ✅   | ❌         | ❌ |
| Ownership / borrowing    | ❌   | ✅   | ❌         | ❌ |
| Lifetime annotations     | ❌   | ✅   | ❌         | ❌ |
| Garbage collection       | ❌   | ❌   | ✅         | ✅ |
| Smart pointers           | ❌   | ✅   | ❌         | ❌ |

## 7. Modules and Organization

| Feature                  | Tuff | Rust | TypeScript | Kotlin |
|--------------------------|------|------|------------|--------|
| Modules / imports        | ❌   | ✅   | ✅         | ✅ |
| Namespaces               | ❌   | ❌   | ✅         | ✅ |
| Packages                 | ❌   | ✅   | ❌         | ✅ |
| Visibility modifiers     | ❌   | ✅   | ❌         | ✅ |
| Re-exports               | ❌   | ✅   | ✅         | ✅ |

## 8. Operators

| Feature                  | Tuff | Rust | TypeScript | Kotlin |
|--------------------------|------|------|------------|--------|
| Arithmetic (+, -, *, /)  | ✅   | ✅   | ✅         | ✅ |
| Modulo (%)               | ❌   | ✅   | ✅         | ✅ |
| Exponentiation (**)      | ❌   | ❌   | ✅         | ❌ |
| Bitwise (&, \|, ^, ~)   | ❌   | ✅   | ✅         | ✅ |
| Bit shift (<<, >>)      | ❌   | ✅   | ✅         | ❌ |
| Comparison               | ✅   | ✅   | ✅         | ✅ |
| Logical (&&, \|\|)      | ✅   | ✅   | ✅         | ✅ |
| Compound assignment      | ⚠️ (+=, -=) | ✅ (all) | ✅ | ✅ |
| Ternary operator         | ❌   | ❌   | ✅         | ❌ |
| Null coalescing (??)     | ❌   | ❌   | ✅         | ✅ |
| Elvis operator           | ❌   | ❌   | ❌         | ✅ |
| Operator overloading     | ❌   | ✅   | ❌         | ✅ |

## 9. Macros and Metaprogramming

| Feature                  | Tuff | Rust | TypeScript | Kotlin |
|--------------------------|------|------|------------|--------|
| Macros                   | ❌   | ✅   | ❌         | ❌ |
| Decorators               | ❌   | ❌   | ✅         | ❌ |
| Annotations              | ❌   | ❌   | ❌         | ✅ |
| Reflection               | ❌   | ❌   | ❌         | ✅ |
| Template literals        | ❌   | ❌   | ✅         | ✅ |

## 10. Concurrency and I/O

| Feature                  | Tuff | Rust | TypeScript | Kotlin |
|--------------------------|------|------|------------|--------|
| Threads                  | ❌   | ✅   | ❌ (worker threads) | ✅ |
| Async / await            | ❌   | ✅   | ✅         | ✅ |
| Channels                 | ❌   | ✅   | ❌         | ❌ |
| File I/O                 | ❌   | ✅   | ✅         | ✅ |
| Networking               | ❌   | ✅   | ✅         | ✅ |

## Priority Recommendations

### High Priority (core language completeness)
1. **Strings** — fundamental for any real program
2. **Floating point** — needed for math, graphics, etc.
3. **Closures / lambdas** — essential for higher-order functions
4. **Return statements** — functions currently only return via expression
5. **Modulo operator** — basic arithmetic gap
6. **Dynamic arrays** — fixed-length arrays are limiting

### Medium Priority (expressiveness)
7. **Enums** — critical for type-safe state representation
8. **Pattern matching** — goes hand-in-hand with enums
9. **Interfaces / traits** — polymorphism without inheritance
10. **Bitwise operators** — needed for low-level work
11. **Full compound assignment** — `*=`, `/=`, `%=`
12. **Ternary operator** — compact conditional expressions

### Low Priority (advanced features)
13. **Generics** — type-safe reusable code
14. **Modules** — code organization
15. **Error handling** — try/catch or Result type
16. **Concise syntax** — template literals, string interpolation
17. **Operator overloading** — custom types with natural operators
