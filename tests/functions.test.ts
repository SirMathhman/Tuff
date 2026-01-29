import { interpret } from '../src/index';

test('interpret rejects narrowing conversions when assigning variables', () => {
  expect(() => interpret('let x = 100U16; let y : U8 = x;')).toThrow();
});

test('interpret treats un-suffixed numeric variables as I32 and rejects narrowing', () => {
  expect(() => interpret('let x = 100; let y : U8 = x; y')).toThrow();
});

test('interpret treats un-suffixed numeric variables as I32 and allows assignment to I32', () => {
  expect(interpret('let x = 100; let y : I32 = x; y')).toBe(100);
});

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

test('interpret function definitions return 0', () => {
  expect(interpret('fn empty() : I32 => 100;')).toBe(0);
});

test('interpret rejects duplicate parameter names in functions', () => {
  expect(() => interpret('fn something(first : I32, first : I32) => {};')).toThrow(
    'duplicate parameter name: first'
  );
});

test('interpret supports void function definitions returning 0', () => {
  expect(interpret('fn empty() : Void => {};')).toBe(0);
});

test('interpret calls void functions and treats result as 0', () => {
  expect(interpret('fn empty() : Void => {}; empty()')).toBe(0);
});

test('interpret rejects bool function results assigned to numeric', () => {
  expect(() =>
    interpret('fn empty() => true; let result : I32 = empty(); result')
  ).toThrow('cannot convert Bool to numeric type');
});

test('interpret rejects duplicate function definitions', () => {
  expect(() =>
    interpret('fn empty() : Void => {}; fn empty() : Void => {};')
  ).toThrow('function already defined: empty');
});

