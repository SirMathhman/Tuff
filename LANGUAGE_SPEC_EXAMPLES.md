## Examples

### Complete Program Examples

#### 1. Simple Calculator

```rust
fn add(a : I32, b : I32) => a + b;
fn multiply(a : I32, b : I32) => a * b;

let result = add(10, multiply(3, 4));
result  // returns 22
```

#### 2. Counter Object

```rust
class fn Counter(initial : I32) => {
    fn increment() => initial = initial + 1;
    fn decrement() => initial = initial - 1;
    fn get() => initial;
}

let mut c : Counter = Counter(0);
c.increment();
c.increment();
c.get()  // returns 2
```

#### 3. Point with Methods

```rust
class fn Point(x : I32, y : I32) => {
    fn manhattan() => x + y;
    fn euclidean() => {
        let dx = x * x;
        let dy = y * y;
        dx + dy  // returns squared distance
    };
}

let p : Point = Point(3, 4);
p.manhattan()   // returns 7
p.euclidean()   // returns 25
```

#### 4. Closure Example

```rust
let x = 100;
let y = 200;

fn compute() => {
    let sum = x + y;
    sum * 2
}

compute()  // returns 600
```

#### 5. Higher-Order Functions

```rust
fn makeMultiplier(factor : I32) => {
    fn multiply(x : I32) => x * factor;
    multiply
}

let double : (I32) => I32 = makeMultiplier(2);
double(5)  // returns 10
```

---

## Language Implementation Notes

### Internal Representations

#### Function Values

Functions are stored with format: `params|return_type|body` or `captures|params|return_type|body`

#### Struct Values

Structs are encoded as: `__STRUCT__:TypeName|field=value|__fn__method=encoded_fn|...`

#### Captured Variables

Captures are stored as: `&x, &mut y` indicating immutable and mutable borrows

### Type Suffixes

Literals can have type suffixes:

- `100I32` - 32-bit signed integer
- `50I8` - 8-bit signed integer
- `255U8` - 8-bit unsigned integer

### Special Variable Prefixes

- `__fn__<name>` - Function definitions
- `__captures__<name>` - Capture specifications
- `__struct__<name>` - Struct definitions
- `__drop__<type>` - Drop handler functions

---

## Future Enhancements

Potential features for future development:

- Boolean type (`Bool`)
- String type
- Arrays and collections
- Pattern matching
- Enums/Sum types
- Traits/Interfaces
- Generics
- Module system
- Standard library

---

## Error Messages

Tuff provides descriptive error messages:

```rust
// Undeclared variable
x + 100  // Error: assignment-to-undeclared-variable: x

// Type mismatch
let x : I8 = 200I8  // Error: integer overflow: 200 exceeds I8 range

// Double borrow
let mut x = 100;
let y = &mut x;
let z = &mut x;  // Error: variable x is already mutably borrowed
```

---

## Conclusion

Tuff is a practical language that combines:

- Static typing with inference
- Functional programming features (closures, higher-order functions)
- Object-oriented programming (classes, methods)
- Memory safety (borrow checking, drop handlers)
- Clean, expressive syntax

The language is designed to be easy to learn while providing powerful features for building complex programs.
