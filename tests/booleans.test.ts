import { assertInvalid, assertValid } from './utils';

test('interpret rejects variable re-declaration in the same scope', () => {
  assertInvalid('let x = 100; let x = 200;');
});

test('interpret supports mutable variables and assignment', () => {
  assertValid('let mut x = 0; x = 100; x', 100);
});

test('interpret rejects assignment to immutable variables', () => {
  assertInvalid('let x = 0; x = 100;');
});

test('interpret rejects assignment to undefined variables', () => {
  assertInvalid('x = 100U16; x');
});

test('interpret rejects narrowing conversions when assigning to mutable variables', () => {
  assertInvalid('let mut x = 0U8; x = 100U16; x');
});

test('interpret returns 0 for a block ending in an assignment with a semicolon', () => {
  assertValid('let mut x : U16 = 100; x = 100U16;', 0);
});

test('interpret supports variable declarations without initializers', () => {
  assertValid('let x : U8; x = 100; x', 100);
});

test('interpret supports reassignment to mutable uninitialized variables', () => {
  assertValid('let mut x : U8; x = 100; x = 200; x', 200);
});

test('interpret supports Bool type and true/false literals', () => {
  assertValid('let x : Bool = true; x', 1);
  assertValid('let x : Bool = false; x', 0);
});

test('interpret rejects arithmetic operations on boolean literals', () => {
  assertInvalid('true + false');
});

test('interpret rejects arithmetic operations on boolean variables', () => {
  assertInvalid('let x : Bool = true; x + 1');
});

test('interpret supports logical OR operator', () => {
  assertValid('true || false', 1);
  assertValid('false || false', 0);
  assertValid('let x = true; let y = false; x || y', 1);
});

test('interpret supports logical AND operator', () => {
  assertValid('true && false', 0);
  assertValid('true && true', 1);
});

test('interpret evaluates conditional expressions in initializers', () => {
  assertValid('let x : U8 = if (true) 2 else 3; x', 2);
});

test('interpret rejects non-boolean if conditions', () => {
  assertInvalid('if (100) 3 else 5');
});

test('interpret rejects mismatched if branches', () => {
  assertInvalid('if (true) true else 5');
});

test('interpret rejects bool declarations with numeric iff branches', () => {
  assertInvalid('let x : Bool = if (true) 5 else 5;');
});

test('interpret allows widening iff results when matching declared suffix', () => {
  assertValid('let x : U16 = if (true) 5U16 else 5U8; x', 5);
});

test('interpret rejects narrowing iff results against declared width', () => {
  assertInvalid('let x : U8 = if (true) 5U16 else 5U8;');
});

test('interpret evaluates chained if/else-if expressions', () => {
  assertValid('if (false) 2 else if (false) 3 else 4', 4);
});

test('interpret evaluates empty block expressions', () => {
  assertValid('let mut x = 0; {} x', 0);
});

test('interpret evaluates block with assignment', () => {
  assertValid('let mut x = 0; { x = 1; } x', 1);
});

test('interpret keeps block-scoped variables from leaking', () => {
  assertInvalid('{ let mut x = 0 }; x = 1; x');
});
