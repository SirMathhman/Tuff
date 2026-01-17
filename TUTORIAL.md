# Tuff Language Tutorial

Tuff is a tiny expression language with typed integer literals, structs, enums, arrays, tuples, pointers, closures, and control flow. This tutorial covers the language features and syntax.

## Table of Contents

1. [Basic Literals and Types](#basic-literals-and-types)
2. [Arithmetic Operations](#arithmetic-operations)
3. [Variables and Assignments](#variables-and-assignments)
4. [Blocks and Expressions](#blocks-and-expressions)
5. [Control Flow](#control-flow)
6. [Functions](#functions)
7. [Closures](#closures)
8. [Structs](#structs)
9. [Enums](#enums)
10. [Arrays](#arrays)
11. [Tuples](#tuples)
12. [Pointers](#pointers)
13. [Modules](#modules)
14. [The `this` Keyword](#the-this-keyword)

---

## Basic Literals and Types

Tuff supports typed integer literals with explicit size annotations:

```tuff
100        // inferred type
100U8      // unsigned 8-bit (0-255)
100U16     // unsigned 16-bit (0-65535)
100I8      // signed 8-bit (-128 to 127)
100I32     // signed 32-bit
```

**Type range checking:**

```tuff
256U8      // Error: out of range
-100U8     // Error: Negative value for unsigned type
```

---

## Arithmetic Operations

Tuff supports standard arithmetic operations with operator precedence:

```tuff
1 + 2                    // 3
2 * 3 - 4                // 2 (multiplication first)
(4 + 2) * 3              // 18 (parentheses override)
10 / 2                   // 5
```

**Type mixing:**

```tuff
1U8 + 2U16               // 3 (types coerce to larger)
255U16 + 1U8             // 256
```

**Division by zero:**

```tuff
10 / (2 - 2)             // Error: Division by zero
```

---

## Variables and Assignments

Variables are declared with `let` and can be immutable or mutable:

```tuff
let x : I32 = 42;        // immutable binding
let mut y : I32 = 10;    // mutable binding
y = 20;                  // reassignment (only for mut)
```

**Type inference:**

```tuff
let x : I32 = 100;       // explicit type
let y = 100U8;           // type inferred from literal
```

**Compound assignments:**

```tuff
let mut x = 10;
x += 5;                  // 15
x -= 3;                  // 12
x *= 2;                  // 24
x /= 4;                  // 6
```

---

## Blocks and Expressions

Blocks `{ }` are expressions that evaluate to their last expression:

```tuff
{ 7 }                    // 7
10 / ({ 7 } - 2)         // 2
1 + { 4 + 2 } * 3        // 19
```

**Blocks with statements:**

```tuff
{
	let x = 10;
	let y = 20;
	x + y
}                        // 30
```

**Scoping:**

```tuff
let x = 1;
{
	let x = 2;           // inner binding
	x                    // 2
}
x                        // 1 (outer binding unchanged)
```

Bindings declared inside a block do not exist outside that block:

```tuff
{
	let x = 1;
}
x                        // Error: Undefined variable
```

---

## Control Flow

### If Expressions

`if` is an expression that returns a value:

```tuff
if 1 < 2 { 100 } else { 200 }     // 100
let x = if 5 > 3 { 10 } else { 0 }; x  // 10
```

### Match Expressions

Pattern matching on values:

```tuff
match (2) {
	case 1 => 100;
	case 2 => 200;
	case _ => 300;
}                        // 200
```

**With variables:**

```tuff
let x = 1;
match (x) {
	case 0 => 10;
	case 1 => 20;
	case _ => 30;
}                        // 20
```

### Loops

**While loops:**

```tuff
let mut i = 0;
while i < 3 {
	i += 1;
}
i                        // 3
```

**For loops (range-based):**

```tuff
let mut sum = 0;
for i in 0..3 {
	sum += i;
}
sum                      // 3 (0 + 1 + 2)
```

**Loop control:**

```tuff
let mut i = 0;
while i < 10 {
	i += 1;
	if i == 5 {
		break;
	}
}
i                        // 5
```

---

## Functions

Functions are declared with `fn` and can have parameters and return types:

```tuff
fn add(x : I32, y : I32) => x + y;
add(10, 20)              // 30
```

**Block bodies:**

```tuff
fn compute(n : I32) => {
	let doubled = n * 2;
	doubled + 1
};
compute(5)               // 11
```

**Void return type:**

```tuff
fn doSomething() : Void => {
	// side effects only
};
```

**Return statements:**

```tuff
fn early() => {
	if 1 > 0 {
		return 100;
	}
	200
};
early()                  // 100
```

**Function references:**

```tuff
fn get() => 42;
let f : () => I32 = get;
f()                      // 42
```

Function types in annotations use the same `=>` arrow syntax:

```tuff
fn add(a : I32, b : I32) : I32 => a + b;
let g : (I32, I32) => I32 = add;
g(2, 3)                   // 5
```

---

## Closures

Functions capture variables from their enclosing scope:

```tuff
let mut x = 0;
fn increment() => {
	x += 1;
	x
};
increment();             // 1
increment();             // 2
x                        // 2
```

**Nested closures:**

```tuff
fn outer(a : I32) => {
	fn inner(b : I32) => a + b;
	inner(10)
};
outer(5)                 // 15
```

**Returning closures:**

```tuff
fn makeAdder(n : I32) : () => I32 => {
	fn add() => n;
	add
};
makeAdder(100)()         // 100
```

---

## Structs

Structs define custom data types with named fields:

```tuff
struct Point {
	x : I32,
	y : I32
}
```

**Instantiation:**

```tuff
let p = Point { x : 3, y : 4 };
p.x                      // 3
p.y                      // 4
p.x + p.y                // 7
```

**Field updates:**

```tuff
let mut p = Point { x : 1, y : 2 };
p.x = 10;
p.x                      // 10
```

**Destructuring:**

```tuff
struct Point { x : I32, y : I32 }
let p = Point { x : 3, y : 4 };
let { x, y } = p;
x + y                    // 7
```

**Empty structs:**

```tuff
struct Empty {}          // valid, evaluates to 0
```

---

## Enums

Enums define a type with a fixed set of named variants:

```tuff
enum Color {
	Red,
	Green,
	Blue
}
```

**Usage:**

```tuff
let c : Color = Color::Red;
c                        // 0 (enum members are indexed)
Color::Green             // 1
Color::Blue              // 2
```

**In expressions:**

```tuff
enum Status { Pending, Active, Complete }
let s : Status = Status::Active;
s * 10                   // 10
```

**Comparisons:**

```tuff
enum Priority { Low, Medium, High }
Priority::Low < Priority::High    // 1 (true)
```

---

## Arrays

Arrays are fixed-size collections with a specific element type:

```tuff
let arr : [I32; 3; 3] = [1, 2, 3];
arr[0]                   // 1
arr[1]                   // 2
arr[0] + arr[1] + arr[2] // 6
```

**Array type syntax:** `[ElementType; InitializedCount; MaxCapacity]`

**Dynamic initialization:**

```tuff
let mut arr : [I32; 0; 3];  // capacity 3, 0 initialized
arr[0] = 10;                // must fill sequentially
arr[1] = 20;
arr[0] + arr[1]             // 30
```

**Bounds checking:**

```tuff
let arr : [I32; 2; 2] = [1, 2];
arr[2]                   // Error: out of bounds
arr[-1]                  // Error: out of bounds
```

**With computed indices:**

```tuff
let arr : [I32; 3; 3] = [10, 20, 30];
let i = 1;
arr[i]                   // 20
```

---

## Tuples

Tuples are fixed-size collections with potentially different element types:

```tuff
let pair : (I32, I32) = (10, 20);
pair.0                   // 10
pair.1                   // 20
pair.0 + pair.1          // 30
```

**Nested tuples:**

```tuff
let nested : ((I32, I32), I32) = ((1, 2), 3);
nested.0.0               // 1
nested.0.1               // 2
nested.1                 // 3
```

**Mixed types:**

```tuff
let mixed : (U8, I32) = (255U8, 1000I32);
mixed.0 + mixed.1        // 1255
```

---

## Pointers

Pointers reference memory locations of variables:

```tuff
let x : I32 = 42;
let p : *I32 = &x;       // immutable pointer
*p                       // 42 (dereference)
*p + 5                   // 47
```

**Mutable pointers:**

```tuff
let mut x : I32 = 10;
let p : *mut I32 = &x;   // mutable pointer
*p                       // 10
*p = 20;                 // modify through pointer
x                        // 20
```

**Pointer arithmetic:**

```tuff
let x : I32 = 5;
let p : *I32 = &x;
*p + *p                  // 10
```

---

## Modules

Modules organize functions into namespaces:

```tuff
module math {
	fn add(a : I32, b : I32) => a + b;
	fn multiply(a : I32, b : I32) => a * b;
}

math::add(10, 20)        // 30
math::multiply(5, 6)     // 30
```

**Nested modules:**

```tuff
module outer {
	module inner {
		fn get() => 42;
	}
}

outer::inner::get()      // 42
```

---

## The `this` Keyword

The `this` keyword captures all function parameters as a struct-like object:

```tuff
fn Point(x : I32, y : I32) : Point => this;
let p : Point = Point(3, 4);
p.x                      // 3
p.y                      // 4
```

**Functions as constructors:**

```tuff
fn Rectangle(width : I32, height : I32) : Rectangle => this;
let r : Rectangle = Rectangle(10, 20);
r.width * r.height       // 200
```

**`this` in modules:**

```tuff
fn get() => 100;
this.get()               // 100 (calls function from current scope)
```

---

## Advanced Examples

### Combining Features

**Struct with methods pattern:**

```tuff
struct Counter { value : I32 }

fn makeCounter(start : I32) : () => I32 => {
	let mut count = start;
	fn increment() => {
		count += 1;
		count
	};
	increment
};

let inc = makeCounter(0);
inc()                    // 1
inc()                    // 2
```

**Match with enums:**

```tuff
enum Status { Pending, Active, Complete }
let s : Status = Status::Active;
match s {
	0 => 10,             // Pending
	1 => 20,             // Active
	2 => 30,             // Complete
	_ => 0
}                        // 20
```

**Arrays with structs:**

```tuff
struct Point { x : I32, y : I32 }
let p1 = Point { x : 1, y : 2 };
let p2 = Point { x : 3, y : 4 };
// Note: arrays of structs require special handling
```

---

## Important Notes

1. **Booleans as numbers:** Comparison operators return `1` for true and `0` for false
2. **Semicolons:** Statements must be terminated with semicolons; the final expression in a block does not need one
3. **Type safety:** Types are checked at parse/interpret time; mismatches cause errors
4. **Scoping:** Block-level scoping applies; inner bindings shadow outer ones
5. **Expression-oriented:** Most constructs are expressions that return values
6. **No null:** Use `Void` for functions with side effects only
7. **Sequential array init:** Partially initialized arrays must be filled in order

---

## Running Tuff Code

### Interpreter

```typescript
import { interpret } from './src/interpret';

const result = interpret('let x = 10; x * 2');
if (result.type === 'ok') {
	console.log(result.value); // 20
}
```

### Compiler

```typescript
import { run } from './src/compiler/run';

const result = run('let x = 10; x * 2', '');
if (result.type === 'ok') {
	console.log(result.value); // 20
}
```

---

## Further Reading

- See test files in `tests/` for comprehensive examples
- Check `src/interpret.ts` for the main interpreter entry point
- Review `src/compiler/compile.ts` for compilation details
- Consult `.github/copilot-instructions.md` for architecture details
