import { interpret } from '../src/index';

test('interpret supports chained addition', () => {
  expect(interpret('1U8 + 2U8 + 3U8')).toBe(6);
});

test('interpret supports chained addition with mixed suffixes and widths', () => {
  expect(interpret('1U8 + 2 + 1000U16')).toBe(1003);
});

test('interpret throws when chained sum overflows the widest type', () => {
  expect(() => interpret('1U8 + 1 + 254')).toThrow('unsigned literal out of range');
});

test('interpret supports addition and subtraction', () => {
  expect(interpret('2U8 + 3U8 - 4U8')).toBe(1);
});

test('interpret supports multiplication with operator precedence', () => {
  expect(interpret('2 * 3 - 4')).toBe(2);
});

test('interpret respects operator precedence (multiplication before addition)', () => {
  expect(interpret('4 + 2 * 3')).toBe(10);
});

test('interpret supports division operator', () => {
  expect(interpret('10 / 2')).toBe(5);
});

test('interpret throws on division by zero', () => {
  expect(() => interpret('10 / 0')).toThrow('division by zero');
});

test('interpret supports parenthesized expressions', () => {
  expect(interpret('(4 + 2) * 3')).toBe(18);
});

test('interpret supports curly braces as grouping operators', () => {
  expect(interpret('(4 + { 2 }) * 3')).toBe(18);
});

test('interpret supports variable declarations within braces', () => {
  expect(interpret('(4 + { let x : U8 = 2; x }) * 3')).toBe(18);
});

test('interpret supports multiple variable declarations within braces', () => {
  expect(interpret('(4 + { let x : U8 = 2; let y : U8 = x; y }) * 3')).toBe(18);
});

test('interpret supports top-level variable declarations', () => {
  expect(interpret('let z : U8 = (4 + { let x : U8 = 2; let y : U8 = x; y }) * 3; z')).toBe(18);
});

test('interpret supports variable declarations without type annotations', () => {
  expect(interpret('let x = 18; x')).toBe(18);
});

test('interpret supports variable declarations with suffix in initializer', () => {
  expect(interpret('let x : U16 = 18U8; x')).toBe(18);
});

test('interpret rejects narrowing conversions in variable declarations', () => {
  expect(() => interpret('let x : U8 = 18U16; x')).toThrow();
});

