import { interpret } from '../src/index';

test('interpret handles pointer types with reference and dereference operators', () => {
  expect(interpret('let x = 100; let y : *I32 = &x; *y')).toBe(100);
});

test('interpret handles mutable pointers with assignment through dereference', () => {
  expect(interpret('let mut x = 0; let y : *mut I32 = &mut x; *y = 100; x')).toBe(100);
});

test('interpret rejects dereferencing non-pointer types', () => {
  expect(() => interpret('let x = 100; *x')).toThrow('cannot dereference non-pointer type');
});

test('interpret rejects pointer type mismatches in initialization', () => {
  expect(() => interpret('let x = 100; let y : *Bool = &x; *y')).toThrow();
});

test('interpret rejects assignment through immutable pointers', () => {
  expect(() => interpret('let mut x = 0; let y = &x; *y = 100; x')).toThrow(
    'cannot assign through immutable pointer'
  );
});

test('interpret allows multiple immutable references to the same variable', () => {
  expect(interpret('let mut x = 0; let y = &x; let z = &x; *y + *z')).toBe(0);
});

test('interpret allows a single mutable reference', () => {
  expect(interpret('let mut x = 0; let z = &mut x; *z')).toBe(0);
});

test('interpret rejects multiple mutable references to the same variable', () => {
  expect(() => interpret('let mut x = 0; let y = &mut x; let z = &mut x; *y + *z')).toThrow(
    'cannot have multiple mutable references to the same variable'
  );
});
