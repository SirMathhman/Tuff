# Tuff Language Tutorial

Tuff is a small, expression-oriented language implemented by this repo’s interpreter.

This tutorial documents the _current_ surface syntax and behavior as exercised by the test suite.

## Running code (quick mental model)

The interpreter evaluates a program and produces a single numeric result (the “exit code”).

- Many things are represented as numbers at runtime:
  - `true` is `1`, `false` is `0`
  - `Char` values are their numeric codepoints (e.g. `'a'` is `97`)
  - String indexing produces a character code (e.g. `"test"[1]` is `101`)

Statements are typically separated with `;`.

Blocks `{ ... }` are expressions: they evaluate to the value of their final expression (unless a `yield` happens).

## 1) Literals and arithmetic

Numeric literals:

- `100`
- Typed numeric literals are accepted (suffix is currently parsed but runtime is numeric): `100U8`, `42I32`, etc.

Operators (examples):

- `+`, `-`, `*`, `/`, `%`
- Parentheses group: `(2 + 3) * 4`

## 2) Variables: `let` and `mut`

Bind variables with `let`:

- With type: `let x : U8 = 3; x`
- Without type: `let x = 100; x`

Mutable variables:

```tuff
let mut x = 0;
x = 100;
x
```

Compound assignment is supported:

```tuff
let mut x = 0;
x += 3;
x
```

## 3) Booleans and comparisons

Booleans:

- `true`, `false`

Logical operators:

- `&&`, `||`, `!`

Comparisons:

- `<`, `<=`, `>`, `>=`, `==`, `!=`

Remember: boolean results are numeric (`1` or `0`).

## 4) Blocks are expressions

Curly braces introduce a block expression:

```tuff
2 + { let x = 3; x }
```

The block’s value is the value of its last expression.

## 5) If / else

`if` works both as an expression and as a statement form (with or without braces):

```tuff
let x = if (true) 2 else 3;
x
```

You can also write block bodies:

```tuff
let mut x = 0;
if (true) { x = 1; } else { x = 2; }
x
```

## 6) Loops

### `while`

```tuff
let mut x = 0;
while (x < 4) x += 1;
x
```

`break` and `continue` are supported.

### `for` with ranges

Ranges use `start..end` (end-exclusive):

```tuff
let mut sum = 0;
for (i in 0..10) sum += i;
sum
```

## 7) Functions

Named functions:

```tuff
fn add(first : I32, second : I32) : I32 => first + second;
add(3, 4)
```

Functions can have block bodies:

```tuff
fn get() : I32 => { if (true) return 100; 20 } + 5;
get()
```

### Inline (lambda) functions

Inline functions can be passed as values:

```tuff
fn get0(get : () => I32) => get() + 1;
get0(() => 100)
```

### “Extension method” style calls (`this`)

If a function’s first parameter is named `this`, it can be called with dot syntax:

```tuff
fn addOne(this : I32) => this + 1;
100.addOne()
```

### Function values and references

You can assign and return function values:

```tuff
let mut x = 0;
fn add() : Void => x += 1;
let temp : () => Void = add;
temp();
x
```

## 8) Structs

Define a struct and instantiate it:

```tuff
struct Point { x : I32; y : I32; }
let temp : Point = Point { 3, 4 };
temp.x + temp.y
```

### Destructuring in `let`

```tuff
struct Wrapper { value : I32; }
let { value } = Wrapper { 100 };
value
```

## 9) Enums

Enums define named variants:

```tuff
enum Color { Red; Green; }
Color::Red == Color::Red
```

(Currently, enum variants evaluate to numeric variant indices.)

## 10) Type aliases, unions, and `is`

Type aliases:

```tuff
type Alias = I32;
let temp : Alias = 100;
temp
```

Union types:

```tuff
struct Some { value : I32; }
struct None {}
type Option = Some | None;
let temp : Option = Some { 100 };
temp is Some
```

The `is` operator returns `1`/`0`. It also supports a destructuring pattern in an `if` condition:

```tuff
struct Some { value : I32; }
struct None {}
type Option = Some | None;
let temp : Option = Some { 100 };
if (temp is Some { value }) value else 20
```

## 11) Pattern matching with `match`

`match` supports numeric cases, wildcard `_`, and struct-variant cases (with optional destructuring):

```tuff
struct Some { value : I32; }
struct None {}
type Option = Some | None;
let temp : Option = Some { 100 };
match (temp) {
  case Some { value } => value;
  case None => 20;
}
```

## 12) Modules

Modules group functions under a namespace, accessed with `::`:

```tuff
module MyModule { fn get() => 100; }
MyModule::get()
```

## 13) Arrays

Array literal and indexing:

```tuff
let array : [I32; 3; 3] = [1, 2, 3];
array[0] + array[1] + array[2]
```

### Array slicing

Slices use `start..end` (end-exclusive) inside `[...]`.

Immutable slice pointer (copied slice values):

```tuff
let array : [I32; 3; 3] = [1, 2, 3];
let slice : *[I32; 2; 2] = &array[0..2];
slice[0] + slice[1]
```

Mutable slice pointer (writes affect the original array):

```tuff
let mut array : [I32; 3; 3] = [1, 2, 3];
let mut slice : *mut [I32; 2; 2] = &mut array[1..3];
slice[1] = 100;
array[2]
```

## 14) Strings and characters

Character literals use single quotes:

```tuff
let c : Char = 'a';
c
```

String literals use double quotes. A `*Str` can be indexed to get character codes:

```tuff
let s : *Str = "test";
s[1]
```

## 15) Pointers: `&`, `&mut`, and `*`

Take a reference with `&` and dereference with `*`:

```tuff
let x = 100;
let y : *I32 = &x;
*y
```

Mutable references allow writing through the pointer:

```tuff
let mut x = 0;
let y : *mut I32 = &mut x;
*y = 100;
x
```

## Notes and current rough edges

This tutorial reflects the current interpreter behavior, which is intentionally small and still evolving.
Some areas you may want to refine as the language grows:

- Runtime representation is largely numeric today (great for a compact interpreter, but you’ll likely want richer runtime values eventually).
- Error messages and type checking rules aren’t described here yet.
