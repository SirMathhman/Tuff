# Missing Language Features

Comparison of Tuff against Rust, TypeScript, and Kotlin.

Legend: ❌ Missing · ⚠️ Partial

## 1. Primitive Types

| Feature           | Tuff | Rust | TypeScript          | Kotlin |
| ----------------- | ---- | ---- | ------------------- | ------ |
| Unit / Void       | ❌   | ✅   | ✅                  | ✅     |
| Nullable / Option | ⚠️   | ✅   | ✅ (undefined/null) | ✅     |

## 2. Composite Types

| Feature                       | Tuff | Rust | TypeScript | Kotlin |
| ----------------------------- | ---- | ---- | ---------- | ------ |
| Dynamic arrays / Vec          | ❌   | ✅   | ✅         | ✅     |
| Unions / Discriminated unions | ✅   | ✅   | ✅         | ✅     |
| Maps / Hash tables            | ❌   | ✅   | ✅         | ✅     |
| Sets                          | ❌   | ✅   | ✅         | ✅     |
| Generics                      | ✅   | ✅   | ✅         | ✅     |

## 3. Type System

| Feature | Tuff | Rust | TypeScript | Kotlin |- ------------------- | ---- | ---- | ---------------- | ------ |
| Traits / Interfaces | ❌ | ✅ | ✅ | ✅ |
| Null safety | ❌ | ✅ | ✅ (strict null) | ✅ |
| Pattern matching | ❌ | ✅ | ❌ | ✅ |

## 4. Control Flow

| Feature                | Tuff | Rust        | TypeScript | Kotlin |
| ---------------------- | ---- | ----------- | ---------- | ------ |
| for-in (collection)    | ❌   | ✅          | ✅         | ✅     |
| Labeled break/continue | ❌   | ✅          | ✅         | ✅     |
| when (Kotlin)          | ❌   | ❌          | ❌         | ✅     |
| try / catch            | ❌   | ❌ (Result) | ✅         | ✅     |
| Exceptions             | ❌   | ❌          | ✅         | ✅     |

## 5. Functions

| Feature             | Tuff | Rust | TypeScript | Kotlin |
| ------------------- | ---- | ---- | ---------- | ------ |
| Closures            | ❌   | ✅   | ✅         | ✅     |
| Lambdas             | ❌   | ✅   | ✅         | ✅     |
| Named parameters    | ❌   | ❌   | ❌         | ✅     |
| Default parameters  | ❌   | ❌   | ✅         | ✅     |
| Variadic arguments  | ❌   | ✅   | ✅         | ✅     |
| Overloading         | ❌   | ❌   | ✅         | ✅     |
| Tail recursion      | ❌   | ✅   | ❌         | ✅     |
| Inline functions    | ❌   | ✅   | ❌         | ✅     |
| Extension functions | ❌   | ❌   | ❌         | ✅     |

## 6. Memory and References

| Feature               | Tuff | Rust | TypeScript | Kotlin |
| --------------------- | ---- | ---- | ---------- | ------ |
| Ownership / borrowing | ❌   | ✅   | ❌         | ❌     |
| Lifetime annotations  | ❌   | ✅   | ❌         | ❌     |
| Garbage collection    | ❌   | ❌   | ✅         | ✅     |
| Smart pointers        | ❌   | ✅   | ❌         | ❌     |

## 7. Modules and Organization

| Feature              | Tuff | Rust | TypeScript | Kotlin |
| -------------------- | ---- | ---- | ---------- | ------ |
| Modules / imports    | ❌   | ✅   | ✅         | ✅     |
| Namespaces           | ❌   | ❌   | ✅         | ✅     |
| Packages             | ❌   | ✅   | ❌         | ✅     |
| Visibility modifiers | ❌   | ✅   | ❌         | ✅     |
| Re-exports           | ❌   | ✅   | ✅         | ✅     |

## 8. Operators

| Feature               | Tuff        | Rust     | TypeScript | Kotlin |
| --------------------- | ----------- | -------- | ---------- | ------ |
| Modulo (%)            | ❌          | ✅       | ✅         | ✅     |
| Exponentiation (\*\*) | ❌          | ❌       | ✅         | ❌     |
| Bitwise (&, \|, ^, ~) | ❌          | ✅       | ✅         | ✅     |
| Bit shift (<<, >>)    | ❌          | ✅       | ✅         | ❌     |
| Compound assignment   | ⚠️ (+=, -=) | ✅ (all) | ✅         | ✅     |
| Ternary operator      | ❌          | ❌       | ✅         | ❌     |
| Null coalescing (??)  | ❌          | ❌       | ✅         | ✅     |
| Elvis operator        | ❌          | ❌       | ❌         | ✅     |
| Operator overloading  | ❌          | ✅       | ❌         | ✅     |

## 9. Macros and Metaprogramming

| Feature           | Tuff | Rust | TypeScript | Kotlin |
| ----------------- | ---- | ---- | ---------- | ------ |
| Macros            | ❌   | ✅   | ❌         | ❌     |
| Decorators        | ❌   | ❌   | ✅         | ❌     |
| Annotations       | ❌   | ❌   | ❌         | ✅     |
| Reflection        | ❌   | ❌   | ❌         | ✅     |
| Template literals | ❌   | ❌   | ✅         | ✅     |

## 10. Concurrency and I/O

| Feature       | Tuff | Rust | TypeScript          | Kotlin |
| ------------- | ---- | ---- | ------------------- | ------ |
| Threads       | ❌   | ✅   | ❌ (worker threads) | ✅     |
| Async / await | ❌   | ✅   | ✅                  | ✅     |
| Channels      | ❌   | ✅   | ❌                  | ❌     |
| File I/O      | ❌   | ✅   | ✅                  | ✅     |
| Networking    | ❌   | ✅   | ✅                  | ✅     |

## Priority Recommendations

### High Priority (core language completeness)

1. **Closures / lambdas** — essential for higher-order functions
2. **Modulo operator** — basic arithmetic gap
3. **Dynamic arrays** — fixed-length arrays are limiting

### Medium Priority (expressiveness)

4. **Interfaces / traits** — polymorphism without inheritance
5. **Bitwise operators** — needed for low-level work
6. **Full compound assignment** — `*=`, `/=`, `%=`
7. **Ternary operator** — compact conditional expressions

### Low Priority (advanced features)

8. **Generics** — type-safe reusable code
9. **Modules** — code organization
10. **Error handling** — try/catch or Result type
11. **Concise syntax** — template literals, string interpolation
12. **Operator overloading** — custom types with natural operators
