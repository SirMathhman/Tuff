import { interpret } from '../src/index';

test('interpret rejects variable re-declaration in the same scope', () => {
  expect(() => interpret('let x = 100; let x = 200;')).toThrow('variable already declared');
});

test('interpret supports mutable variables and assignment', () => {
  expect(interpret('let mut x = 0; x = 100; x')).toBe(100);
});

test('interpret rejects assignment to immutable variables', () => {
  expect(() => interpret('let x = 0; x = 100;')).toThrow('cannot assign to immutable variable');
});

test('interpret rejects assignment to undefined variables', () => {
  expect(() => interpret('x = 100U16; x')).toThrow('undefined variable');
});

test('interpret rejects narrowing conversions when assigning to mutable variables', () => {
  expect(() => interpret('let mut x = 0U8; x = 100U16; x')).toThrow();
});

test('interpret returns 0 for a block ending in an assignment with a semicolon', () => {
  expect(interpret('let mut x : U16 = 100; x = 100U16;')).toBe(0);
});

test('interpret supports variable declarations without initializers', () => {
  expect(interpret('let x : U8; x = 100; x')).toBe(100);
});

test('interpret supports reassignment to mutable uninitialized variables', () => {
  expect(interpret('let mut x : U8; x = 100; x = 200; x')).toBe(200);
});

test('interpret supports Bool type and true/false literals', () => {
  expect(interpret('let x : Bool = true; x')).toBe(1);
  expect(interpret('let x : Bool = false; x')).toBe(0);
});

test('interpret evaluates conditional expressions in initializers', () => {
  expect(interpret('let x : U8 = if (true) 2 else 3; x')).toBe(2);
});

test('interpret rejects non-boolean if conditions', () => {
  expect(() => interpret('if (100) 3 else 5')).toThrow('if condition must be boolean');
});

test('interpret rejects mismatched if branches', () => {
  expect(() => interpret('if (true) true else 5')).toThrow('if branches must match types');
});

test('interpret rejects bool declarations with numeric iff branches', () => {
  expect(() => interpret('let x : Bool = if (true) 5 else 5;')).toThrow(
    'cannot convert numeric type to Bool'
  );
});

test('interpret allows widening iff results when matching declared suffix', () => {
  expect(interpret('let x : U16 = if (true) 5U16 else 5U8; x')).toBe(5);
});

test('interpret rejects narrowing iff results against declared width', () => {
  expect(() => interpret('let x : U8 = if (true) 5U16 else 5U8;')).toThrow();
});

test('interpret evaluates chained if/else-if expressions', () => {
  expect(interpret('if (false) 2 else if (false) 3 else 4')).toBe(4);
});

test('interpret evaluates empty block expressions', () => {
  expect(interpret('let mut x = 0; {} x')).toBe(0);
});

test('interpret evaluates block with assignment', () => {
  expect(interpret('let mut x = 0; { x = 1; } x')).toBe(1);
});

test('interpret keeps block-scoped variables from leaking', () => {
  expect(() => interpret('{ let mut x = 0 }; x = 1; x')).toThrow('undefined variable');
});

