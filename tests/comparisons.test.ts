import { interpret } from '../src/index';

test('interpret rejects compound assignment to undefined variables', () => {
  expect(() => interpret('x += 1;')).toThrow('undefined variable');
});

test('interpret rejects compound assignment to boolean variables', () => {
  expect(() => interpret('let mut x = true; x += 1;')).toThrow(
    'cannot perform arithmetic on booleans'
  );
});

test('interpret rejects compound assignment with boolean rhs', () => {
  expect(() => interpret('let mut x = 0; x += true;')).toThrow(
    'cannot perform arithmetic on booleans'
  );
});

test('interpret allows compound assignment for mutable variables', () => {
  expect(interpret('let mut x = 10; x += 1; x')).toBe(11);
});

test('interpret rejects compound assignment for immutable variables', () => {
  expect(() => interpret('let x = 10; x += 1; x')).toThrow('cannot assign to immutable variable');
});

test('interpret handles while loops', () => {
  expect(interpret('let mut x = 0; while (x < 4) x += 1; x')).toBe(4);
});

test('interpret handles while loops with braces', () => {
  expect(interpret('let mut x = 0; while (x < 4) { x += 1; } x')).toBe(4);
});

test('interpret rejects non-boolean while conditions', () => {
  expect(() => interpret('let mut x = 0; while (100) x += 1; x')).toThrow(
    'while condition must be boolean'
  );
});

