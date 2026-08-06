# Missing Features

Features that would be useful to add to Tuff, grouped by category.

## String Support

- [x] String literals (`"hello"`)
- [ ] String concatenation (`"hi" + "there"`)
- [x] String length (`.length`)
- [x] String indexing (`"hello"[0]`)
- [x] String comparison (`"a" < "b"`)
- [ ] String interpolation (`"x is {x}"`)

## Control Flow

- [x] `return` statement in functions (early return)
- [x] `else if` chaining for if statements
- [ ] `do { ... } while (cond)` — post-condition loop
- [ ] Labeled loops with `break 'label` and `continue 'label`
- [ ] `return` without value (returns `null`)

## Data Types

- [ ] Structs / named tuples (`struct Point { x, y }`)
- [ ] Enums (`enum Color { Red, Green, Blue }`)
- [ ] Union types (`type Result = Ok | Err`)
- [ ] Dynamic types / `any`
- [ ] Sets (`{1, 2, 3}`)
- [x] Records / maps (`{ x : 3, y : 4 }` with `.field` access)

## Collections

- [x] Array mutation (`array[0] = 5`)
- [x] Array length (`.length`)
- [ ] Array slicing (`array[1..3]`)
- [ ] Array concatenation (`[1, 2] + [3, 4]`)
- [ ] Array iteration (`for (x in array)`)
- [ ] Tuple destructuring (`let (a, b) = (1, 2)`)
- [ ] Spread operator (`[...a, 4]`)

## Functions

- [x] Closures (capture by reference)
- [x] Recursive functions
- [ ] Variadic functions (`fn sum(...args)`)
- [ ] Default parameter values (`fn greet(name, greeting = "hi")`)
- [ ] Named arguments (`fn greet(name: "Alice")`)
- [ ] Higher-order functions (`map`, `filter`, `reduce`)
- [ ] Function composition (`f | g`)
- [x] Anonymous functions / lambdas (`fn(x, y) => x + y`)
- [ ] Method syntax (`obj.method()`)

## Pattern Matching

- [x] Basic pattern matching with `case` and wildcard `_`
- [ ] Pattern matching on tuples (`case (1, _) => ...`)
- [ ] Pattern matching on arrays (`case [1, ..] => ...`)
- [ ] Guard clauses (`case x if x > 0 => ...`)
- [ ] Pattern matching on structs
- [ ] Or patterns (`case 1 | 2 => ...`)

## Operators

- [x] Modulo (`%`)
- [ ] Exponentiation (`**`)
- [ ] Bitwise operators (`&`, `|`, `^`, `~`, `<<`, `>>`)
- [x] Compound assignment (`+=`, `-=`)
- [ ] Compound assignment (`*=`, `/=`)
- [ ] Increment / decrement (`++x`, `x++`, `--x`, `x--`)
- [ ] Ternary operator (`cond ? a : b`)
- [ ] Null coalescing (`a ?? b`)
- [ ] Safe navigation (`a?.b`)

## I/O & Built-ins

- [ ] `print()` / `println()`
- [ ] `input()` — read from stdin
- [ ] `type()` — get type of value
- [ ] `range()` — generate range as array
- [ ] `min()`, `max()`
- [ ] `abs()`, `sqrt()`, `pow()`
- [ ] `random()`
- [ ] `sleep()` / `wait()`

## Modules & Organization

- [ ] `import` / `require` — load other files
- [ ] `export` — expose functions/values
- [ ] Namespaces (`namespace math { ... }`)
- [ ] Standard library

## Type System

- [x] Type annotations (`let x : U8 = 5`)
- [ ] Type inference (infer `let x = 5` as `U8` or `I32`)
- [ ] Type inference display (`typeof(x)`)
- [ ] Type casting (`x as int`)
- [ ] Type aliases (`type Id = U32`)
- [ ] Generics (`fn identity<T>(x: T) => x`)
- [ ] Const generics / compile-time constants
- [ ] Type narrowing in `if`/`match` branches
- [ ] Compile-time type checking mode
- [ ] Type error messages with source location
- [ ] Variance checking (covariant/contravariant generics)
- [ ] Type-level arithmetic (e.g., array size as type parameter)

## Error Handling

- [ ] `try { ... } catch (e) { ... }`
- [ ] `throw` expression
- [ ] `Result<T, E>` type
- [ ] `?` operator for error propagation
- [ ] Custom error types

## Concurrency

- [ ] `async` / `await`
- [ ] `spawn` — run in parallel
- [ ] Channels for communication
- [ ] Mutex / atomic operations

## Metaprogramming

- [ ] Macros
- [ ] `eval()` — runtime code execution
- [ ] Reflection (`obj.keys()`, `obj.values()`)

## Syntax Sugar

- [ ] Shorthand property access (`a.b.c` for nested tuples)
- [ ] Destructuring assignment (`let { x, y } = point`)
- [ ] Optional chaining (`a?.b?.c`)
- [ ] Template literals
- [ ] Multi-line strings

## Tooling

- [ ] REPL / interactive mode
- [ ] Formatter
- [ ] Linter
- [ ] Documentation comments (`///`)
- [ ] Source maps for errors (line numbers)
- [ ] Pretty-printed error messages with context

## Performance

- [ ] Bytecode compilation
- [ ] JIT compilation
- [ ] Tail call optimization
- [ ] Memoization / caching
