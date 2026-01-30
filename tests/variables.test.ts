import { assertInvalid, assertValid } from './utils';

test('interpret supports chained addition', () => {
  assertValid('1U8 + 2U8 + 3U8', 6);
});

test('interpret supports chained addition with mixed suffixes and widths', () => {
  assertValid('1U8 + 2 + 1000U16', 1003);
});

test('interpret throws when chained sum overflows the widest type', () => {
  assertInvalid('1U8 + 1 + 254');
});

test('interpret supports addition and subtraction', () => {
  assertValid('2U8 + 3U8 - 4U8', 1);
});

test('interpret supports multiplication with operator precedence', () => {
  assertValid('2 * 3 - 4', 2);
});

test('interpret respects operator precedence (multiplication before addition)', () => {
  assertValid('4 + 2 * 3', 10);
});

test('interpret supports division operator', () => {
  assertValid('10 / 2', 5);
});

test('interpret throws on division by zero', () => {
  assertInvalid('10 / 0');
});

test('interpret supports parenthesized expressions', () => {
  assertValid('(4 + 2) * 3', 18);
});

test('interpret supports curly braces as grouping operators', () => {
  assertValid('(4 + { 2 }) * 3', 18);
});

test('interpret supports variable declarations within braces', () => {
  assertValid('(4 + { let x : U8 = 2; x }) * 3', 18);
});

test('interpret supports multiple variable declarations within braces', () => {
  assertValid('(4 + { let x : U8 = 2; let y : U8 = x; y }) * 3', 18);
});

test('interpret supports top-level variable declarations', () => {
  assertValid('let z : U8 = (4 + { let x : U8 = 2; let y : U8 = x; y }) * 3; z', 18);
});

test('interpret supports variable declarations without type annotations', () => {
  assertValid('let x = 18; x', 18);
});

test('interpret rejects narrowing conversions when assigning variables', () => {
  assertInvalid('let x = 100U16; let y : U8 = x;');
});

test('interpret treats un-suffixed numeric variables as I32 and rejects narrowing', () => {
  assertInvalid('let x = 100; let y : U8 = x; y');
});

test('interpret treats un-suffixed numeric variables as I32 and allows assignment to I32', () => {
  assertValid('let x = 100; let y : I32 = x; y', 100);
});

test('interpret supports variable declarations with suffix in initializer', () => {
  assertValid('let x : U16 = 18U8; x', 18);
});

test('interpret rejects narrowing conversions in variable declarations', () => {
  assertInvalid('let x : U8 = 18U16; x');
});

test('interpret rejects reassignment to immutable variables even if initially uninitialized', () => {
  assertInvalid('let x : U8; x = 100; x = 200; x');
});
