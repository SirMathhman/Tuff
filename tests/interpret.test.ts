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

test('interpret accepts max unsigned U16', () => {
  expect(interpret('65535U16')).toBe(65535);
});

test('interpret rejects unsigned overflow U16', () => {
  expect(() => interpret('65536U16')).toThrow('unsigned literal out of range');
});

test('interpret accepts signed I8 bounds', () => {
  expect(interpret('127I8')).toBe(127);
  expect(interpret('-128I8')).toBe(-128);
});

test('interpret rejects signed I8 overflow', () => {
  expect(() => interpret('128I8')).toThrow('signed literal out of range');
  expect(() => interpret('-129I8')).toThrow('signed literal out of range');
});

test('interpret rejects unsupported suffixes and invalid widths', () => {
  expect(() => interpret('100XYZ')).toThrow('invalid suffix');
  expect(() => interpret('100U7')).toThrow('invalid suffix');
});

test('interpret adds two U8 literals', () => {
  expect(interpret('1U8 + 2U8')).toBe(3);
});

test('interpret adds mixed literal and U8 literal', () => {
  expect(interpret('1 + 2U8')).toBe(3);
});

test('interpret adds mixed U8 literal and plain literal', () => {
  expect(interpret('1U8 + 2')).toBe(3);
});

test('interpret throws when sum overflows operand type (U8)', () => {
  expect(() => interpret('1U8 + 255')).toThrow('unsigned literal out of range');
});

test('interpret allows sum with mixed widths using wider type (U8 + U16)', () => {
  expect(interpret('1U8 + 255U16')).toBe(256);
});

test('interpret throws when sum overflows wider type in mixed-width addition', () => {
  expect(() => interpret('1U8 + 65535U16')).toThrow('unsigned literal out of range');
});

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
  expect(
    interpret('let z : U8 = (4 + { let x : U8 = 2; let y : U8 = x; y }) * 3; z')
  ).toBe(18);
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

test('interpret returns 0 for a declaration without a trailing expression', () => {
  expect(interpret('let x = 100;')).toBe(0);
});

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

test('interpret rejects numeric values for Bool type', () => {
  expect(() => interpret('let x : Bool = 1;')).toThrow();
  expect(() => interpret('let x : Bool; x = 1;')).toThrow();
});

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

test('interpret rejects narrowing conversions when assigning variables', () => {
  expect(() => interpret('let x = 100U16; let y : U8 = x;')).toThrow();
});
