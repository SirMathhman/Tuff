import { interpret } from '../src/index';

test('interpret is a stub that returns 0 for empty input', () => {
  expect(interpret('')).toBe(0);
});

test('interpret returns 0 for arbitrary input (stub)', () => {
  expect(interpret('some input')).toBe(0);
});

test('interpret parses integer numeric literals', () => {
  expect(interpret('100')).toBe(100);
});

test('interpret parses integer numeric literals with unsigned suffixes', () => {
  expect(interpret('100U8')).toBe(100);
});

test('interpret throws for negative values with unsigned suffixes', () => {
  expect(() => interpret('-100U8')).toThrow('unsigned literal cannot be negative');
});

test('interpret rejects lowercase unsigned suffix', () => {
  expect(() => interpret('100u8')).toThrow('invalid suffix');
});

test('interpret throws for unsigned overflow (U8)', () => {
  expect(() => interpret('256U8')).toThrow('unsigned literal out of range');
});

test('interpret accepts max unsigned U8', () => {
  expect(interpret('255U8')).toBe(255);
});
