# The Tuff Language

Tuff is a small, statically typed language. A Tuff program is a string, and its result is the value of its final expression. It is interpreted in TypeScript, and this document describes the language as the interpreter accepts it today.

## Running a program

```ts
import { interpretTuff } from "./index";

interpretTuff("let x = 2; x * 3"); // { ok: true, value: 6 }
interpretTuff("1 + true"); // { ok: false, error: "..." }
```

A program is a list of statements followed by one final expression. The result is a number. A boolean result is returned as `1` (true) or `0` (false). An empty program has the value `0`. A failure is returned as an error message that says what was found, where, and how to fix it. The interpreter never throws for a bad program.

Whitespace and comments are ignored. Comments use `//` to the end of the line, or `/* ... */`.

## Numbers and booleans

Number literals are non-negative whole numbers, such as `0`, `42`. The words `true` and `false` are booleans; they are stored as `1` and `0`.

| Operator | Meaning                                        |
| -------- | ---------------------------------------------- |
| `*`      | multiplication (binds tighter than the others) |
| `+`, `-` | addition, subtraction                          |
| `==`     | equal, yields `1` or `0`                       |
| `<`      | less than, yields `1` or `0`                   |
| `( )`    | grouping                                       |

```
1 + 2 * 3        // 7
(1 + 2) * 3      // 9
let x = 5; x == 5   // 1
```

Arithmetic operands must be numbers. `1 + true` is an error. Equality is described under Equality below.

## Variables

`let` declares a variable. A variable is read-only unless it is declared with `let mut`.

```
let x = 5;
let mut count = 0;
count = 2;      // allowed: count is mut
count += 3;     // compound assignment: +=, -=, *=
count *= 2;
count           // 10
```

Assigning to a variable that is not `mut` is an error. The final expression is the value of the program or block.

A type can be written after the name. Integer types are named by their kind, such as `I32` and `U8`, and a value must fit the declared type.

```
let x : U8 = 200;
x     // 200
```

A declaration can destructure a module's exports, described under Modules.

## Blocks and scope

A block is a list of statements and a final expression in braces. Its variables are visible only inside it. A block's value is its final expression, and the block may read variables from the enclosing scope.

```
let y = { let z = 3; z + 1 };   // y is 4; z is not visible here
```

A reference (`&x`) may not outlive the variable it points to. A block cannot return a reference to a variable it declared.

## Conditionals

`if` takes a parenthesized condition. It can be used as an expression, where both branches are required, or as a statement.

```
let x = if (1 == 1) 1 else 2;    // 1
```

`match` chooses a case by value. Each case ends with `;`, and `_` matches anything.

```
let x = 2;
match (x) { case 1 => 10; case 2 => 20; case _ => 0; }   // 20
```

## Loops

`while` repeats its body while the condition holds. `for` takes an initializer, a condition, and a step; the step is a statement followed by `;` before the closing parenthesis.

```
let mut i = 0;
while (i < 3) { i += 1; }        // i is 3

let mut sum = 0;
for (let mut i = 0; i < 4; i += 1;) { sum += i; }   // sum is 6
```

`loop` runs until `break`. The value given to `break` is the value of the loop, so a `loop` is usually the initializer of a `let`.

```
let mut counter = 0;
let x = loop { if (counter < 4) counter += 1; else break counter; };   // x is 4
```

A loop may run at most 10000 iterations. Loops nested inside each other can therefore run much longer, so keep them small.

## Functions

Functions are declared with `fn`. Parameters and the return type are annotated. A function whose result is not used is declared `Void`.

```
fn add(a : I32, b : I32) : I32 => a + b;
add(2, 3)                         // 5

fn show(v : I32) : Void => {}
show(1);
```

A generic function declares type parameters in `< >`. Type arguments are given at the call site.

```
fn id<T>(a : T) : T => a;
id<I32>(4)                        // 4
```

Calls may nest, up to a depth of 100. Functions declared with `fn` may be called before their declaration in the same block.

A call's result can be read with `.name` or `[index]`, as in `Wrapper().x`.

## Structs

A struct is a named set of typed fields. Generic structs take type parameters the same way generic functions do.

```
struct Point { x : I32, y : I32 }
let p = Point { x : 1, y : 2 };
p.y                               // 2
```

Every field must be given exactly once, and each value must have the field's type.

## Arrays

An array has a fixed element type and length, written `[T; n]`, or inferred from its literal.

```
let array : [I32; 3] = [1, 2, 3];
array[0] + array[1] + array[2]    // 6
```

## References

`&x` makes a reference to a variable, and `*r` reads through it. `&mut x` makes a reference that can be assigned through with `*r = value;`, but only when `x` is `let mut`.

```
let mut x = 1;
let r = &mut x;
*r = 7;
x                                 // 7
```

## Equality

`==` compares two values of the same kind. A kind mismatch, such as a number and a reference, is an error. Numbers and booleans compare by value. Arrays, structs, and objects cannot be compared directly.

References compare what they point to, and the rule depends on the kind of the pointee:

- A reference to a number or boolean is equal to another reference whose pointee has the same value: `let a = 1; let b = 1; &a == &b` is `1`.
- A reference to an array, struct, or object is equal only to a reference to the same value: `let p = P { x : 1 }; let q = P { x : 1 }; &p == &q` is `0`, but `let q = p; &q == &p` is `1`. An object is the same value only when it is the same object, so `&A == &B` is `0` for two objects with identical fields.

This is the current behavior. Whether aggregates should instead compare by value is an open question (see ARCHITECTURE.md, Future Work).

## Namespaces

A namespace groups declarations under a name. The body runs in its own scope. Only names declared with `out let` inside it can be read from outside, as `Name::member`.

```
namespace Foo {
  out let x = 100;
  let hidden = 1;
}

Foo::x        // 100
```

- `Foo::hidden` is an error, because `hidden` is not declared with `out`.
- A namespace and a variable in the same scope cannot share a name.
- A namespace name is resolved before a module path. A namespace named `foo` therefore shadows the module path `foo::lib`.
- A namespace declared inside an `if` branch is not visible after it.

## Objects

An object is a named value whose `out` names are its fields. It is declared with `object` and read with `.`, the same way a module's exports are read.

```
object Singleton {
  out let x = 1;
}

Singleton.x        // 1
```

- An object is a variable, so it can be bound with `let` and passed around: `let s = Singleton; s.x`.
- `Singleton.hidden` is an error when `hidden` is not declared with `out`.
- An object cannot share a name with a namespace or a variable declared earlier in the same scope. A `let` that comes after an object with the same name is not yet an error; it replaces the object.
- Objects are read with `.`. The `::` form is for namespaces only.
- An object can export functions with `out fn`, which are called as a statement with `Name.fn();`. The function is declared `: Void` and runs in the object's scope, so it can read and assign the object's names.
- An `out let mut` field is shared: a function that assigns it changes the value that `Name.field` reads.

```
object Singleton {
  out let mut x = 0;

  out fn increment() : Void => {
    x += 1;
  }
}

Singleton.increment();
Singleton.increment();
Singleton.x        // 2
```

Functions exported with `out fn` are only available in an object body. A module or namespace cannot export a function.

### Templates

An object whose body declares an input with `in let` is a template. A template is not a value of its own. Each instance is built with `Name { input : value, ... }`, and its body runs with those inputs. Every input the body declares must be given, and no other input may be given.

```
object Box {
  in let foo : I32;
  out let doubled = foo + foo;
}

let b = Box { foo : 3 };
&Box { foo : 3 } == &Box { foo : 3 }   // 1: instances with equal inputs are equal
&Box { foo : 3 } == &Box { foo : 4 }   // 0
```

- `&Name { ... }` builds an instance and makes a reference to it. The instance lives in the enclosing scope, so the reference may not outlive that scope.
- Two references to instances of the same template are equal when their inputs are equal. Other references to objects are equal only to the same object. An input that is a number or boolean is compared by value. An input that is a reference is compared by what it points to, the same as `==` on references, so `&Box { r : &a } == &Box { r : &b }` is `1` when `a` and `b` hold the same number. Any other input is compared by identity.
- A template's body is run for each instance, so its errors are reported when an instance is built, not when the template is declared.

## This

`this.name` reads a name of the current scope.

- Outside an object body, it reads a variable declared directly in the current scope, so `let x = 1; this.x` is `1`. It does not read a variable declared in an enclosing scope.
- Inside an object body, including a block nested in the body, it reads a name the object exports with `out`, the same rule as `Name.name` from outside. `this.p` for a name that is not exported is an error.
- Inside a namespace body, it reads any variable declared directly in that body, including names the namespace does not export. This is intended.

- Bare `this`, with no `.name` after it, is a snapshot value: a struct named after the function it is written in (`this` outside any function). Its fields are the names `this.name` can read at that point, each with its value at that moment. Inside an object body those are the exported names, so private names do not leak. It can be bound with `let`, returned from a function, and read with `.name`. A function may name its own return type, so `fn Wrapper() : Wrapper => { let x = 1; this }` is valid.

- Inside a function, `Name.this`, where `Name` is that function, is a snapshot of the variables of the current call, from the current point outward to the call, including the private variables of any object body in between. Inner variables shadow outer ones. It is a struct named after the function. Unlike bare `this` inside an object body, it does not stop at exports.

`this` is a reserved word.

## Modules

A program can use other modules. Each module is its own source text, loaded by name through `interpretModules`. Within a module, `out let` exports a name, and `in let` declares an input that the importing program passes in.

```
// module "lib"
in let x : I32;
out let value = x;
```

```
// module "main"
let { value } = lib { x : 4 }; value      // 4
```

A module can also be read as a value with `.`:

```
lib.value                                  // reads the module's exported value
```

A module in a subdirectory is named with `::`, which is written `foo::lib` and loaded from the path `foo/lib`. A module may use another module's functions through an `expect` and `actual` pair, which link the declared function to its implementation.

## Host values

The host program can pass values and functions into a Tuff program by name. A Tuff program declares them with `declare let` and `declare fn`, and reads them as ordinary names. Host functions receive numbers and booleans only. How the host boundary is controlled is described in [security.md](security.md).

## Errors

An error names what the interpreter found, where it was (line and column), what it expected, and how to change the source. Common causes are:

- an operator applied to the wrong kind of value, such as `1 + true`;
- assignment to a variable that is not `let mut`;
- a value that does not fit its declared integer type;
- a name that is not in scope, or a namespace member that is not exported with `out`.

## Limits

These limits are part of the language. The values are the interpreter's constants `MAX_LOOP_ITERATIONS` and `MAX_CALL_DEPTH`. `MAX_CALL_DEPTH` counts function calls and the instances of object templates built while another is running, so a template that builds itself stops with an error.

- Number literals are non-negative whole numbers.
- A loop runs at most 10000 times.
- Function calls nest at most 100 deep.
- Nested `if` statements are re-parsed, so very deep nesting becomes slow. The cost is analyzed in [ARCHITECTURE.md](../ARCHITECTURE.md#potential-problems).

## Related documents

- [README.md](../README.md): how to install and run the project.
- [ARCHITECTURE.md](../ARCHITECTURE.md): how the interpreter is built, and its design problems.
- [security.md](security.md): trust boundaries, controls, and known gaps.
