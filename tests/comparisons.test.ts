import { assertInvalid, assertValid } from './utils';

test('interpret rejects compound assignment to undefined variables', () => {
  assertInvalid('x += 1;');
});

test('interpret rejects compound assignment to boolean variables', () => {
  assertInvalid('let mut x = true; x += 1;');
});

test('interpret rejects compound assignment with boolean rhs', () => {
  assertInvalid('let mut x = 0; x += true;');
});

test('interpret allows compound assignment for mutable variables', () => {
  assertValid('let mut x = 10; x += 1; x', 11);
});

test('interpret rejects compound assignment for immutable variables', () => {
  assertInvalid('let x = 10; x += 1; x');
});

test('interpret handles while loops', () => {
  assertValid('let mut x = 0; while (x < 4) x += 1; x', 4);
});

test('interpret handles while loops with braces', () => {
  assertValid('let mut x = 0; while (x < 4) { x += 1; } x', 4);
});

test('interpret rejects non-boolean while conditions', () => {
  assertInvalid('let mut x = 0; while (100) x += 1; x');
});
