# JavaScript Features Not in Tuff

This document lists JavaScript features that do not currently exist in the Tuff language.

## Control Flow

| Feature              | JavaScript Example                     |
| -------------------- | -------------------------------------- |
| `if` / `else`        | `if (x > 0) { ... } else { ... }`      |
| `switch` / `case`    | `switch (x) { case 1: ... }`           |
| `for` loop           | `for (let i = 0; i < 10; i++) { ... }` |
| `while` loop         | `while (x > 0) { ... }`                |
| `do...while` loop    | `do { ... } while (x > 0)`             |
| `break` / `continue` | `break;` / `continue;`                 |
| Ternary operator     | `x > 0 ? "yes" : "no"`                 |
| Labeled statements   | `outer: for (...) { break outer; }`    |

## Variable Declarations

| Feature                | JavaScript Example       |
| ---------------------- | ------------------------ |
| `const`                | `const x = 10;`          |
| `var`                  | `var x = 10;`            |
| Destructuring (object) | `const { a, b } = obj;`  |
| Destructuring (array)  | `const [a, b] = arr;`    |
| Default destructuring  | `const { a = 1 } = obj;` |

## Arrays

| Feature                            | JavaScript Example      |
| ---------------------------------- | ----------------------- |
| Array literals                     | `[1, 2, 3]`             |
| Array indexing                     | `arr[0]`                |
| `push`, `pop`, `shift`, `unshift`  | `arr.push(x)`           |
| `map`, `filter`, `reduce`          | `arr.map(x => x * 2)`   |
| `forEach`, `find`, `some`, `every` | `arr.forEach(x => ...)` |
| `length` property                  | `arr.length`            |
| Spread in arrays                   | `[...arr1, ...arr2]`    |

## Operators

| Feature               | JavaScript Example             |
| --------------------- | ------------------------------ |
| Strict equality       | `x === y` / `x !== y`          |
| Compound assignment   | `x += 1` / `x -= 1` / `x *= 2` |
| Increment / Decrement | `x++` / `x--` / `++x` / `--x`  |
| Exponentiation        | `x ** 2`                       |
| Comma operator        | `(x = 1, y = 2)`               |
| `typeof`              | `typeof x`                     |
| `void`                | `void 0`                       |
| `delete`              | `delete obj.key`               |
| `in`                  | `"key" in obj`                 |
| `instanceof`          | `x instanceof Array`           |
| Optional chaining     | `obj?.prop`                    |
| Nullish coalescing    | `x ?? defaultValue`            |

## Functions

| Feature                    | JavaScript Example                      |
| -------------------------- | --------------------------------------- |
| Function expressions       | `const fn = function(x) { return x; };` |
| Block-body arrow functions | `x => { return x * 2; }`                |
| Default parameters         | `fn(x = 10) => x`                       |
| Rest parameters            | `fn(...args) => args`                   |
| IIFEs                      | `(function() { ... })()`                |
| Recursion                  | `fn fact(n) => n * fact(n - 1)`         |
| `this` keyword             | `this.x`                                |
| `bind`, `call`, `apply`    | `fn.bind(obj)`                          |

## Objects

| Feature                                          | JavaScript Example                     |
| ------------------------------------------------ | -------------------------------------- |
| Computed property keys                           | `{ [key]: value }`                     |
| Shorthand properties                             | `{ x, y }` instead of `{ x: x, y: y }` |
| Method definitions                               | `{ method() { ... } }`                 |
| `Object.keys`, `Object.values`, `Object.entries` | `Object.keys(obj)`                     |
| `Object.assign`, `Object.freeze`                 | `Object.assign(target, source)`        |
| Dynamic property access                          | `obj[key]`                             |
| Spread in objects                                | `{ ...obj1, ...obj2 }`                 |

## Classes & Inheritance

| Feature             | JavaScript Example                 |
| ------------------- | ---------------------------------- |
| `class` declaration | `class Person { ... }`             |
| `extends`           | `class Dog extends Animal { ... }` |
| `super`             | `super()` / `super.method()`       |
| `constructor`       | `constructor(name) { ... }`        |
| Static methods      | `static helper() { ... }`          |
| Getters / Setters   | `get name() { ... }`               |
| Prototype chain     | `obj.__proto__`                    |

## Error Handling

| Feature                     | JavaScript Example              |
| --------------------------- | ------------------------------- |
| `try` / `catch` / `finally` | `try { ... } catch (e) { ... }` |
| `throw`                     | `throw new Error("msg")`        |
| `Error` constructor         | `new Error("msg")`              |

## Async & Concurrency

| Feature                     | JavaScript Example                      |
| --------------------------- | --------------------------------------- |
| `Promise`                   | `new Promise((resolve, reject) => ...)` |
| `async` / `await`           | `async fn() => await fetch(url)`        |
| `setTimeout`, `setInterval` | `setTimeout(cb, 1000)`                  |

## Modules

| Feature            | JavaScript Example                   |
| ------------------ | ------------------------------------ |
| `import`           | `import x from "module"`             |
| `export`           | `export default x` / `export { x }`  |
| Dynamic `import()` | `const mod = await import("module")` |

## Literals & Strings

| Feature                | JavaScript Example       |
| ---------------------- | ------------------------ |
| Template literals      | `` `hello ${name}` ``    |
| Tagged templates       | `` tag`hello ${name}` `` |
| Single-quoted strings  | `'hello'`                |
| Unicode escapes        | `\u0041`                 |
| BigInt                 | `123n`                   |
| Floating-point numbers | `3.14`                   |
| Hexadecimal            | `0xFF`                   |
| Octal                  | `0o77`                   |
| Binary                 | `0b1010`                 |

## Built-in Objects & APIs

| Feature              | JavaScript Example        |
| -------------------- | ------------------------- |
| `Math`               | `Math.sqrt(16)`           |
| `JSON`               | `JSON.stringify(obj)`     |
| `Array` constructor  | `new Array(5)`            |
| `Object` constructor | `new Object()`            |
| `Map`, `Set`         | `new Map()` / `new Set()` |
| `WeakMap`, `WeakSet` | `new WeakMap()`           |
| `Symbol`             | `Symbol("desc")`          |
| `Proxy`, `Reflect`   | `new Proxy(obj, handler)` |
| `console`            | `console.log(x)`          |
| `process`            | `process.argv`            |
| `Date`               | `new Date()`              |
| `RegExp`             | `/pattern/flags`          |
| `Intl`               | `Intl.DateTimeFormat`     |

## Other

| Feature                      | JavaScript Example               |
| ---------------------------- | -------------------------------- |
| Comments (`//`, `/* */`)     | `// comment`                     |
| `eval`                       | `eval("code")`                   |
| `with` statement             | `with (obj) { ... }`             |
| Generators                   | `function* gen() { yield 1; }`   |
| `yield`                      | `yield value`                    |
| `new` operator               | `new Constructor()`              |
| Strict mode                  | `"use strict"`                   |
| Closures                     | Nested functions capturing scope |
| Hoisting                     | `console.log(x); var x = 1;`     |
| Global object (`globalThis`) | `globalThis.x`                   |
| Web APIs (DOM, Fetch, etc.)  | `document.getElementById`        |
