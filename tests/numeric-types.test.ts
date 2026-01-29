import { interpret } from '../src/index';

test('interpret enforces numeric type constraints in declarations', () => {
  expect(interpret('let x : I32 < 10 = 5; x')).toBe(5);
  expect(() => interpret('let x : I32 < 10 = 20; x')).toThrow();
});

test('interpret supports USize type', () => {
  expect(interpret('let x : USize = 100USize; x')).toBe(100);
});

test('interpret parses integer numeric literals with unsigned suffixes', () => {
  expect(interpret('100U8')).toBe(100);
});

test('interpret throws for negative values with unsigned suffixes', () => {
  expect(() => {
    interpret('-100U8');
  }).toThrow();
});

test('interpret rejects lowercase unsigned suffix', () => {
  expect(() => {
    interpret('100u8');
  }).toThrow();
});

test('interpret throws for unsigned overflow (U8)', () => {
  expect(() => {
    interpret('256U8');
  }).toThrow();
});

test('interpret accepts max unsigned U8', () => {
  expect(interpret('255U8')).toBe(255);
});

test('interpret accepts max unsigned U16', () => {
  expect(interpret('65535U16')).toBe(65535);
});

test('interpret rejects unsigned overflow U16', () => {
  expect(() => {
    interpret('65536U16');
  }).toThrow();
});

test('interpret accepts signed I8 bounds', () => {
  expect(interpret('127I8')).toBe(127);
  expect(interpret('-128I8')).toBe(-128);
});

test('interpret rejects signed I8 overflow', () => {
  expect(() => {
    interpret('128I8');
  }).toThrow();
  expect(() => {
    interpret('-129I8');
  }).toThrow();
});

test('interpret rejects unsupported suffixes and invalid widths', () => {
  expect(() => {
    interpret('100XYZ');
  }).toThrow();
  expect(() => {
    interpret('100U7');
  }).toThrow();
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
  expect(() => {
    interpret('1U8 + 255');
  }).toThrow();
});

test('interpret allows sum with mixed widths using wider type (U8 + U16)', () => {
  expect(interpret('1U8 + 255U16')).toBe(256);
});

