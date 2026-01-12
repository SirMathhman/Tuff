# Tuff

A small TypeScript interpreter for the Tuff language.

## Getting started

- Install dependencies with pnpm.
- Run the test suite with `pnpm test`.

## Higher-order functions

Tuff supports function values (functions can be:

- assigned to variables,
- passed as arguments,
- returned from other functions).

Example (returning a function / closure capture):

- `let makeAdder = fn make(n : I32) => { fn add(x : I32) => { x + n }; add };`
- `let add2 = makeAdder(2);`
- `add2(3)` evaluates to `5`.

## Type aliases

You can create block-scoped type aliases:

- `type MyInt = I32;`
- `let x : MyInt = 5;`

## Arrays and slices

Tuff supports fixed-size arrays and borrowing them as slices.

- Arrays use a type like `[I32; init; length]`.
  - `init` must be `0` (uninitialized, sequential writes required) or equal to `length` (fully initialized).
- Slice borrows are written using pointer-like syntax:
  - `let s : *[I32] = &arr;` (immutable slice)
  - `let s : *mut [I32] = &mut arr;` (mutable slice)

Indexing expressions like `arr[0]` and `s[0]` can be freely combined with arithmetic, e.g. `s[0] + s[2]`.

## Linear types (move + destructor)

You can define a linear type from a base type and a destructor function:

- `fn drop(v: I32) => { /* ... */ };`
- `type L = I32 then drop;`

Semantics:

- **Move**: `let y = x;` moves ownership from `x` to `y` (using `x` afterwards throws `Use-after-move`).
- **Auto-drop on scope exit**: if a live linear binding reaches the end of its scope, its destructor is called automatically.
- **Drop on reassignment**: assigning a new value to a live linear binding drops the old value first.
- **Pointers**: taking `&x`, dereferencing `*p`, or assigning through `*p = ...` will throw `Use-after-move` if the pointee linear binding has been moved/dropped.
- **Borrowing (minimal)**: creating a pointer with `&x` or `&mut x` borrows the binding.
  - `&mut x` is exclusive (no other borrows allowed).
  - You cannot move or assign a borrowed binding (throws `Cannot move while borrowed` / `Cannot assign while borrowed`).
