import { assertValid, assertInvalid } from './utils';

test('interpret supports generic identity function', () => {
  assertValid('fn pass<T>(value : T) => value; pass(100)', 100);
});

test('interpret rejects copying arrays', () => {
  assertInvalid('let array : [I32; 3; 3] = [1, 2, 3]; let array0 = array;');
});

test('interpret supports slice pointer indexing', () => {
  assertValid(
    'let array = [1, 2, 3]; let slice : *[I32] = &array; slice[0] + slice[1] + slice[2]',
    6
  );
});

test('interpret allows copying slice pointers', () => {
  assertValid('let array = [1, 2, 3]; let x : *[I32] = &array; let y = x; y[0]', 1);
});

test('interpret handles array indexing bounds', () => {
  assertValid('let array = [1, 2, 3]; array[1]', 2);
  assertInvalid('let array = [1, 2, 3]; array[-1]');
  assertInvalid('let array = [1, 2, 3]; array[3]');
});

test('interpret enforces ordered array initialization', () => {
  assertInvalid('let mut array : [I32; 0; 3]; array[0]');
  assertValid('let mut array : [I32; 0; 3]; array[0] = 100; array[0]', 100);
  assertInvalid('let mut array : [I32; 0; 3]; array[1] = 1; array[0] = 2; array[0]');
});

test('interpret allows assigning into uninitialized arrays before passing', () => {
  assertValid(
    'let mut array : [I32; 0; 3]; array[0] = 100; fn getFirst(arr : [I32; 1; 3]) => arr[0]; getFirst(array)',
    100
  );
});

test('interpret rejects passing arrays with insufficient initialized elements', () => {
  assertInvalid(
    'let mut array : [I32; 0; 3]; fn getFirst(arr : [I32; 1; 3]) => arr[0]; getFirst(array)'
  );
});

test('interpret rejects calling a non-function variable', () => {
  assertInvalid('let x = 100; x()');
});

test('interpret reports missing method on value', () => {
  assertInvalid('fn List<T>() => { let x = 1; this }; let list = List<I32>(); list.getFirst();');
});

test('interpret parses integer numeric literals with unsigned suffixes', () => {
  assertValid('100U8', 100);
});

test('interpret throws for negative values with unsigned suffixes', () => {
  assertInvalid('-100U8');
});

test('interpret rejects lowercase unsigned suffix', () => {
  assertInvalid('100u8');
});

test('interpret throws for unsigned overflow (U8)', () => {
  assertInvalid('256U8');
});

test('interpret accepts max unsigned U8', () => {
  assertValid('255U8', 255);
});

test('interpret accepts max unsigned U16', () => {
  assertValid('65535U16', 65535);
});

test('interpret rejects unsigned overflow U16', () => {
  assertInvalid('65536U16');
});

test('interpret accepts signed I8 bounds', () => {
  assertValid('127I8', 127);
  assertValid('-128I8', -128);
});

test('interpret rejects signed I8 overflow', () => {
  assertInvalid('128I8');
  assertInvalid('-129I8');
});

test('interpret rejects unsupported suffixes and invalid widths', () => {
  assertInvalid('100XYZ');
  assertInvalid('100U7');
});

test('interpret adds two U8 literals', () => {
  assertValid('1U8 + 2U8', 3);
});

test('interpret adds mixed literal and U8 literal', () => {
  assertValid('1 + 2U8', 3);
});

test('interpret adds mixed U8 literal and plain literal', () => {
  assertValid('1U8 + 2', 3);
});

test('interpret throws when sum overflows operand type (U8)', () => {
  assertInvalid('1U8 + 255');
});

test('interpret allows sum with mixed widths using wider type (U8 + U16)', () => {
  assertValid('1U8 + 255U16', 256);
});
