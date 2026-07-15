# Tuff Compiler - Feature Roadmap

Features that Tuff should have but doesn't yet. Organized by category and rough priority.

## Type System

- **Primitive types** — `U8`, `U16`, `U32`, `U64`, `I16`, `I32`, `I64`, `F32`, `F64`, `Char`, `String` (currently everything compiles to `int`)
- **Type inference** — infer variable types from expressions instead of defaulting to `int`
- **Type checking** — reject invalid operations at compile time (e.g., `1 + "hello"`, `read() + true`)
- **Enums** — `enum Color { Red, Green, Blue }` with discriminant values
- **Type aliases** — `type Meter = I32` for creating named type synonyms
- **Const generics** — `struct Array<T, N> { data: [T; N] }` with compile-time size parameters

## Expressions & Operators

- **String literals** — `"hello"` with concatenation (`+`) and length (`.len`)
- **Character literals** — `'a'` with comparison and arithmetic
- **Floating point literals** — `3.14`, `1.0e-5`
- **Bitwise operators** — `&`, `|`, `^`, `~`, `<<`, `>>`
- **Logical operators** — `!` (not) ✅, `||` (or), `&&` (and) — partially implemented for booleans
- **Type-check operator** — `expr is Type` — ✅ implemented
- **Ternary expression** — `cond ? a : b` as syntactic sugar for `if (cond) a else b`
- **Match/switch expressions** — `match x { 1 => "one", 2 => "two", _ => "other" }`
- **Tuples** — `(1, "hello", true)` with destructuring: `let (a, b) = pair`
- **Closures** — `let f = |x| x + 1` with capture semantics
- **Operator overloading** — custom operators for user-defined types

## Control Flow

- **Do-while loops** — `do { body } while (cond)` for post-test loops
- **Break/continue** — `break` and `continue` statements in loops
- **Labeled breaks** — `break 'outer` for breaking out of nested loops
- **Goto** — `goto label` / `label:` for low-level control flow (optional, for FFI interop)
- **Return statements** — explicit `return expr` inside functions (currently only expression-based)
- **Recursion** — recursive function calls (currently untested, may not work with eager read evaluation)
- **Nested function definitions** — functions defined inside other functions with closure capture

## Memory & Data Structures

- **Pointers** — `let p : *I32 = &x` with dereference `*p` and indirection
- **References** — `let r : &I32 = &x` for borrow semantics (read-only or mutable)
- **Dynamic arrays** — `let mut arr = Vec::new()` with `.push()`, `.pop()`, `.len()`, `.get(i)`
- **Hash maps** — `let mut map = HashMap::new()` with `.insert(k, v)`, `.get(k)`, `.remove(k)`
- **String type** — `let s : String = "hello"` with `.len`, `.chars()`, `.substring(start, end)`, `.concat(other)`
- **Slices** — `let slice = &arr[1..4]` for borrowing array ranges
- **Heap allocation** — `malloc`/`free` wrappers for dynamic memory management
- **Stack arrays** — VLA support or fixed-size arrays on the stack

## Functions & Modules

- **Method syntax** — `obj.method()` as syntactic sugar for `method(obj)`
- **Default parameters** — `fn greet(name : String, greeting : String = "Hello") => ...`
- **Variadic functions** — `fn sum(values : *I32, count : I32) => ...`
- **Function overloading** — multiple functions with the same name but different signatures
- **Modules** — `mod math { fn add(a, b) => a + b }` with `use math::add`
- **File-based modules** — `import "math.tuff"` for cross-file code organization
- **Visibility modifiers** — `pub fn` vs `fn` for controlling module exports
- **Trait/interface system** — `trait Printable { fn print() => String }` with `impl Printable for Point`
- **Associated functions** — `fn Point::new(x, y) => Point { x, x }` (static methods)

## Error Handling

- **Result type** — `Result<T, E>` with `Ok(value)` and `Err(error)` variants
- **Try operator** — `let x = do_something()?` for propagating errors
- **Panic** — `panic!("error message")` for unrecoverable errors
- **Assert macros** — `assert!(condition)`, `assert_eq!(a, b)`, `assert_ne!(a, b)`
- **Custom error types** — `enum Error { NotFound, PermissionDenied, IoError(String) }`
- **Safe FFI boundary** — automatic error checking when calling external C code

## Macros & Metaprogramming

- **Declarative macros** — `macro! repeat($n, $body) => { ... }` for code generation
- **Const evaluation** — `const PI : F64 = 3.14159` evaluated at compile time
- **Compile-time assertions** — `static_assert(sizeof(Point) == 8)` for invariants
- **Attribute system** — `#[inline]`, `#[no_optimize]`, `#[export]` for codegen hints
- **Code generation macros** — `derive!(Clone, Debug)` for automatic trait implementation

## I/O & System

- **File I/O** — `open("file.txt")`, `read_file()`, `write_file()`, `close()`
- **Print functions** — `print("hello")`, `println!("value: {}", x)` with format strings
- **Environment variables** — `env::get("HOME")`, `env::set("KEY", "value")`
- **Command-line arguments** — `args()` returning `["prog", "arg1", "arg2"]`
- **System time** — `time::now()`, `time::sleep(ms)`
- **Random numbers** — `rand::next()`, `rand::range(min, max)`
- **Networking** — `connect("localhost:8080")`, `send()`, `receive()` (advanced)

## Concurrency

- **Threads** — `thread::spawn(|| { ... })` with join and detach
- **Channels** — `let (tx, rx) = channel()` for message passing between threads
- **Mutex/RwLock** — `let mutex = Mutex::new(value)` for shared state protection
- **Atomic operations** — `AtomicI32` with `load()`, `store()`, `fetch_add()`
- **Async/await** — `async fn fetch(url) => String` with non-blocking I/O
- **Futures** — `Future<T>` trait with `.then()`, `.map()`, `.and_then()` combinators

## Compiler Infrastructure

- **Proper lexer** — tokenization pass instead of string splitting (current parser is fragile)
- **AST representation** — typed data structures instead of string manipulation
- **Type checker pass** — separate phase for type inference and validation
- **Custom error types** — `CompileError` enum with location info instead of `String`
- **Source maps** — map generated C errors back to Tuff source locations
- **Incremental compilation** — only recompile changed files in a module system
- **Optimization passes** — constant folding, dead code elimination, inlining
- **Debug information** — DWARF generation for debugger support
- **WASM target** — compile to WebAssembly for browser execution
- **Cross-compilation** — target different architectures (x86, ARM, RISC-V)

## Testing & Tooling

- **Standard library** — `std::` module with common utilities (collections, I/O, math)
- **Benchmark harness** — `#[bench]` attribute for performance testing
- **Documentation generator** — extract doc comments into HTML documentation
- **Language server** — LSP implementation for IDE support (completions, go-to-definition)
- **Formatter** — `tufffmt` tool for consistent code style
- **Linting** — `tufflint` for catching common mistakes and style issues
- **REPL** — interactive shell for experimenting with Tuff code
- **Package manager** — dependency resolution and version management

## Language Design

- **Pattern matching** — `match point { Point(0, 0) => "origin", Point(x, 0) => "x-axis", _ => "other" }`
- **Struct destructuring** — `let Point { x, y } = p` for extracting fields
- **Operator precedence** — well-defined precedence table (currently relies on C's precedence)
- **Comments** — `// line comment`, `/* block comment */` support
- **Documentation comments** — `///` for public API documentation
- **Visibility system** — `pub`, `pub(crate)`, `pub(super)` for module visibility
- **Lifetime annotations** — `'a` for borrow checker (if adding references)
- **Null/option types** — `Option<T>` with `Some(value)` and `None` variants
- **Generics with bounds** — `fn max<T : Comparable>(a : T, b : T) => T`

---

## Suggested Implementation Order

1. **Proper lexer → AST** — foundational, makes everything else safer
2. **Custom error types** — better diagnostics for users
3. **Primitive types & type checking** — core language safety
4. **String type & literals** — most requested practical feature
5. **Match expressions** — powerful pattern matching
6. **Modules & imports** — code organization at scale
7. **Result type & error handling** — idiomatic error management
8. **Standard library** — practical utilities for real programs
9. **Dynamic arrays (Vec)** — essential data structure
10. **File I/O** — move beyond stdin/stdout
