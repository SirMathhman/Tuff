# Tuff Language Tutorial

Tuff is a small Rust-ish DSL interpreted by `src/index.ts`. The language behavior is defined by the Jest test suite in `tests/interpret.test.ts`.

## Running Tuff code

- `pnpm start` runs `bun ./src/index.ts`, which loads `src/index.tuff` and prints the result of `interpret(...)`.
- `pnpm dev` watches `src/**/*.ts` and `*.tuff` and re-runs on changes.

Tuff programs evaluate to a single numeric result:

- The value of the final expression is the program result.
- If the program ends in a statement with a trailing `;`, the result is `0`.

## Comments

- Line comments: `// ...` (until newline)
- Block comments: `/* ... */`
- Comment markers inside strings are not treated as comments.

Example:

```tuff
let x = 1; // ignored
/* ignored */
x + 2
```

## Statements and blocks

- Statements are separated by semicolons: `...;`.
- Braces `{ ... }` create a block expression.
  - Variables declared in a block do not leak out.
  - Mutations to _outer_ variables are merged back out.

Example:

```tuff
let mut x = 0;
{ x = 1; }
x
```

## Literals and primitive types

### Numbers

- Plain numeric literals are treated as `I32` for type validation.
- Numeric suffixes are **case-sensitive**:
  - Unsigned: `U8`, `U16`, `U32`, `U64`, `USize`
  - Signed: `I8`, `I16`, `I32`, `I64`

Examples:

```tuff
100
100U8
-128I8
100USize
```

Sharp edges:

- Lowercase unsigned suffixes are rejected: `100u8` → `invalid suffix`.
- Range is checked for suffixed literals (e.g. `256U8` errors).

### Bool

- `true` / `false`
- Stored as `1` / `0`.
- Arithmetic with booleans errors.

### Char

- Char literals use single quotes: `'a'`, `'Z'`, `'0'`.
- Evaluates to the UTF-16 code unit number.

### Str

- String literals use double quotes: `"hello"`.
- Strings are commonly used through pointers (`*Str`).

## Variables

### Declaration

- `let name = expr;`
- `let name : Type = expr;`
- `let mut name = expr;` (mutable)

You can also declare without an initializer, then assign later:

```tuff
let mut x : U8;
x = 100;
x
```

### Assignment

- Only `mut` variables can be assigned.
- Compound assignments exist: `+=`, `-=`, `*=`, `/=`.

Example:

```tuff
let mut x = 10;
x += 1;
x
```

### Type constraints

A declaration can constrain a numeric value:

```tuff
let x : I32 < 10 = 5;
x
```

## Expressions

### If (expression form)

`if` is an expression and requires an `else`:

```tuff
if (true) 2 else 3
```

Rules:

- Condition must be `Bool`.
- Both branches must have matching types.

### While

`while` evaluates to `0` but can mutate state:

```tuff
let mut x = 0;
while (x < 4) { x += 1; }
x
```

## Functions

Define a function:

```tuff
fn add(first : I32, second : I32) => first + second;
add(3, 4)
```

Notes:

- Function definitions at top-level evaluate to `0`.
- Return types are optional; if omitted, Tuff infers from the body.
- `Void` functions exist: `fn empty() : Void => {};`.
- Functions can access outer-scope variables (closure-ish behavior).

### Generics

Functions can be generic:

```tuff
fn pass<T>(value : T) => value;
pass(100)
```

## Structs

Define a struct:

```tuff
struct Point { x : I32; y : I32; }
```

Instantiate using a positional struct literal:

```tuff
struct Wrapper { x : I32; }
let value : Wrapper = Wrapper { 100 };
value.x
```

### Generic structs

```tuff
struct Wrapper<T> { field : T; }
let w : Wrapper<I32> = Wrapper<I32> { 100 };
w.field
```

## Arrays

Array literals:

```tuff
[1, 2, 3]
```

Typed arrays carry both **initialized count** and **length**:

- `[I32; 1; 3]` means length 3, with at least 1 initialized element.

Example:

```tuff
let mut a : [I32; 0; 3];
a[0] = 100;
a[0]
```

Rules to know:

- Elements must be initialized in order (can’t assign `a[1]` before `a[0]`).
- Non-literal array values cannot be copied (e.g. `let b = a;` errors).

### Slices

You can take a pointer to an array slice type and index it:

```tuff
let array = [1, 2, 3];
let slice : *[I32] = &array;
slice[0] + slice[1] + slice[2]
```

## Pointers and references

- Immutable reference: `&x`
- Mutable reference: `&mut x` (requires `x` is `mut`)
- Dereference: `*ptr`

Pointer types:

- `*I32` (immutable pointer)
- `*mut I32` (mutable pointer)

Example:

```tuff
let mut x = 0;
let p : *mut I32 = &mut x;
*p = 100;
x
```

Borrowing rule:

- You can have multiple immutable references.
- You can have only one active mutable reference to the same variable.

## `this` and method-style calls

`this` is a synthetic snapshot of the current scope.

- Access variables via `this.x`.
- You can take references to the current scope: `&this` / `&mut this`.

Method-style calls are supported:

- `expr.fn()` can call a function as a method depending on the function’s first parameter.

Example (by-value `this`):

```tuff
fn add(this : I32) => this + 1;
100.add()
```

Example (mutable pointer `this`):

```tuff
fn addOnce(this : *mut I32) => *this = *this + 1;
let mut y = 100;
y.addOnce();
y
```

## Function pointers and `::`

Functions can be stored and called via function pointer types:

```tuff
fn get() => 100;
let f : () => I32 = get;
f()
```

You can also extract an **unbound** function pointer from a returned `this` value using `::`, then call it with an explicit context pointer:

```tuff
fn outer(x : I32, y : I32) => { fn inner() => x + y; this }
let o : outer = outer(3, 4);
let innerPtr : *(*outer) => I32 = o::inner;
innerPtr(&o)
```

## Singleton objects

A singleton `object` defines a named scope with variables/functions:

```tuff
object MySingleton { let mut counter = 0; fn add() => counter += 1; }
MySingleton.add();
MySingleton.counter
```

Pointer identity works for singletons:

```tuff
object MySingleton {}
&MySingleton == &MySingleton
```
