import { interpret } from '../src/index';

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

test('interpret rejects equality comparison between different types (number and bool)', () => {
  expect(() => interpret('100 == true')).toThrow('cannot compare different types');
});
