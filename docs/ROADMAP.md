# Tuff Language Roadmap

## Implementation Progress

| Feature                          | Status      | Tests                                                                   |
| -------------------------------- | ----------- | ----------------------------------------------------------------------- |
| 1. Variables & Let Bindings      | ✅ Complete | `let`, mutable bindings, type inference, no-shadowing                   |
| 2. Primitive Operations          | ✅ Complete | All arithmetic, comparison, logical operators; boolean literals         |
| 3. Control Flow (if/else, while) | ✅ Complete | if/else statements & expressions, while, loop, break, continue          |
| 4. Structs                       | ✅ Complete | Definition, instantiation, field access, mutation, nesting              |
| 5. Functions                     | ✅ Complete | Declaration, calls, return statements, recursion, forward refs          |
| 6. Enums                         | ✅ Complete | Simple unit enums, variant access, equality comparison                  |
| 7. Generics & Collections        | ✅ Complete | Generic functions & structs, type inference, C++ templates & JS dynamic |
| 8. expect/actual Multi-platform  | ✅ Complete | Fully qualified names, signature validation, JS & C++ codegen           |
| 9. Modules & Namespaces          | ✅ Complete | Module blocks, FQN support, nested modules, JS & C++ codegen            |
| 10. Pointers & Arrays            | ✅ Complete | Pointer refs/deref, mutable/immutable, array literals, indexing         |
| 11. Ownership & Borrow Checking  | ✅ Complete | Move semantics, borrow tracking, lifetime elision                       |
| 12. Function Pointers            | ✅ Complete | Function pointer types, references, nested generics                     |
| 13-15. Advanced Features         | ⏹️ Deferred | Type aliases, destructors, type inference improvements                  |

## Standard Library Status

The standard library is currently in early development (`src/tuff/`).

| Module    | Status      | Description                                   |
| :-------- | :---------- | :-------------------------------------------- |
| `array`   | ✅ Basic    | Array utilities                               |
| `argv`    | ✅ Complete | Command line arguments                        |
| `file`    | ✅ Complete | File I/O (read/write, directory ops, delete)  |
| `io`      | ✅ Minimal  | Console I/O (relies on externs)               |
| `map`     | ✅ Usable   | Hash map implementation                       |
| `math`    | ✅ Basic    | Basic math functions                          |
| `mem`     | ✅ Basic    | Memory management (malloc/free)               |
| `option`  | ✅ Usable   | Option type                                   |
| `process` | ✅ Basic    | Process execution (run external programs)     |
| `result`  | ✅ Usable   | Result type                                   |
| `slice`   | ✅ Basic    | Slice utilities                               |
| `string`  | ✅ Usable   | String operations (includes advanced methods) |
| `testing` | ✅ Basic    | Simple testing framework with assertions      |
| `vector`  | ✅ Usable   | Dynamic array implementation                  |

## Bootstrapping Requirements

To achieve self-hosting (compiling the Tuff compiler with Tuff), the following standard library features must be implemented:

1.  **✅ StringBuilder**: Efficient string construction for code generation (DONE).
2.  **✅ Advanced String Manipulation**: All methods complete including `split`, `trim`, `startsWith`, `endsWith`, `replace`, `toUpperCase`, `toLowerCase` (DONE).
3.  **✅ File System API**: Robust file reading/writing, directory traversal, existence checks, and deletion (DONE).
4.  **✅ Command Line Arguments**: Access to `argv`/`argc` to read input file paths and flags (DONE).
5.  **✅ Process Execution**: Execute external programs with arguments and working directory (DONE).
6.  **✅ Testing Framework**: Simple assertion-based testing with `assertTrue`, `assertEqualI32`, etc. (DONE).
7.  **❌ Char/String Iterators**: For efficient lexing.

## Bootstrap Progress Checklist

### String Operations (Critical for Lexer/Parser)

- ✅ `length`, `charAt`, `concat`, `equals`
- ✅ `substring`, `indexOf`
- ✅ `startsWith`, `endsWith`, `trim`, `contains`
- ✅ `replace`, `toUpperCase`, `toLowerCase`, `isEmpty`
- ✅ `split` (delimiter-based string tokenization)

## Future Extensions

Features not yet implemented but planned:

- Literal types with compile-time range tracking and overflow detection
- Advanced array initialization tracking
- Pattern matching on enums with associated data
- Trait/interface system
- Module system beyond expect/actual
- Compile-time metaprogramming
- Error handling (Result types)
