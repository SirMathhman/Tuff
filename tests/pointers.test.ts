import { assertInvalid, assertValid } from './utils';

test('interpret handles pointer types with reference and dereference operators', () => {
  assertValid('let x = 100; let y : *I32 = &x; *y', 100);
});

test('interpret handles mutable pointers with assignment through dereference', () => {
  assertValid('let mut x = 0; let y : *mut I32 = &mut x; *y = 100; x', 100);
});

test('interpret rejects dereferencing non-pointer types', () => {
  assertInvalid('let x = 100; *x');
});

test('interpret rejects pointer type mismatches in initialization', () => {
  assertInvalid('let x = 100; let y : *Bool = &x; *y');
});

test('interpret rejects assignment through immutable pointers', () => {
  assertInvalid('let mut x = 0; let y = &x; *y = 100; x');
});

test('interpret allows multiple immutable references to the same variable', () => {
  assertValid('let mut x = 0; let y = &x; let z = &x; *y + *z', 0);
});

test('interpret allows a single mutable reference', () => {
  assertValid('let mut x = 0; let z = &mut x; *z', 0);
});

test('interpret rejects multiple mutable references to the same variable', () => {
  assertInvalid('let mut x = 0; let y = &mut x; let z = &mut x; *y + *z');
});
