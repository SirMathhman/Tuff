import { assertInvalid, assertValid } from './utils';

test('enforces numeric type constraints in declarations', () => {
  assertValid('let x : I32 < 10 = 5; x', 5);
  assertInvalid('let x : I32 < 10 = 20; x');
});

test('supports USize type', () => {
  assertValid('let x : USize = 100USize; x', 100);
});

test('parses integer numeric literals with unsigned suffixes', () => {
  assertValid('100U8', 100);
});

test('throws for negative values with unsigned suffixes', () => {
  assertInvalid('-100U8');
});

test('rejects lowercase unsigned suffix', () => {
  assertInvalid('100u8');
});

test('throws for unsigned overflow (U8)', () => {
  assertInvalid('256U8');
});

test('accepts max unsigned U8', () => {
  assertValid('255U8', 255);
});

test('accepts max unsigned U16', () => {
  assertValid('65535U16', 65535);
});

test('rejects unsigned overflow U16', () => {
  assertInvalid('65536U16');
});

test('accepts signed I8 bounds', () => {
  assertValid('127I8', 127);
  assertValid('-128I8', -128);
});

test('rejects signed I8 overflow', () => {
  assertInvalid('128I8');
  assertInvalid('-129I8');
});

test('rejects unsupported suffixes and invalid widths', () => {
  assertInvalid('100XYZ');
  assertInvalid('100U7');
});

test('adds two U8 literals', () => {
  assertValid('1U8 + 2U8', 3);
});

test('adds mixed literal and U8 literal', () => {
  assertValid('1 + 2U8', 3);
});

test('adds mixed U8 literal and plain literal', () => {
  assertValid('1U8 + 2', 3);
});

test('throws when sum overflows operand type (U8)', () => {
  assertInvalid('1U8 + 255');
});

test('allows sum with mixed widths using wider type (U8 + U16)', () => {
  assertValid('1U8 + 255U16', 256);
});
