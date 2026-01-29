import { interpret } from '../src/index';

test('interpret rejects reassignment to immutable variables even if initially uninitialized', () => {
  expect(() => interpret('let x : U8; x = 100; x = 200; x')).toThrow(
    'cannot assign to immutable variable'
  );
});

test('interpret rejects arithmetic operations on boolean literals', () => {
  expect(() => interpret('true + false')).toThrow('cannot perform arithmetic on booleans');
});

test('interpret rejects arithmetic operations on boolean variables', () => {
  expect(() => interpret('let x : Bool = true; x + 1')).toThrow(
    'cannot perform arithmetic on booleans'
  );
});

test('interpret supports less-than comparison operator', () => {
  expect(interpret('let x = 0; let y = 1; x < y')).toBe(1);
  expect(interpret('let x = 1; let y = 0; x < y')).toBe(0);
});

test('interpret supports all comparison operators', () => {
  expect(interpret('1 < 2')).toBe(1);
  expect(interpret('2 < 1')).toBe(0);
  expect(interpret('1 <= 1')).toBe(1);
  expect(interpret('1 <= 0')).toBe(0);
  expect(interpret('2 > 1')).toBe(1);
  expect(interpret('1 > 2')).toBe(0);
  expect(interpret('1 >= 1')).toBe(1);
  expect(interpret('0 >= 1')).toBe(0);
  expect(interpret('1 == 1')).toBe(1);
  expect(interpret('1 == 2')).toBe(0);
  expect(interpret('1 != 2')).toBe(1);
  expect(interpret('1 != 1')).toBe(0);
});

test('interpret supports logical OR operator', () => {
  expect(interpret('true || false')).toBe(1);
  expect(interpret('false || false')).toBe(0);
  expect(interpret('let x = true; let y = false; x || y')).toBe(1);
});

test('interpret supports logical AND operator', () => {
  expect(interpret('true && false')).toBe(0);
  expect(interpret('true && true')).toBe(1);
});

test('interpret rejects equality comparison between different types (number and bool)', () => {
  expect(() => interpret('100 == true')).toThrow('cannot compare different types');
});
