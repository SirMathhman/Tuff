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
