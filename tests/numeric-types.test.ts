import { interpret } from '../src/index';

test('interpret supports generic identity function', () => {
  expect(interpret('fn pass<T>(value : T) => value; pass(100)')).toBe(100);
});

test('interpret rejects copying arrays', () => {
  expect(() => interpret('let array : [I32; 3; 3] = [1, 2, 3]; let array0 = array;')).toThrow();
});

test('interpret supports slice pointer indexing', () => {
  expect(
    interpret('let array = [1, 2, 3]; let slice : *[I32] = &array; slice[0] + slice[1] + slice[2]')
  ).toBe(6);
});

test('interpret allows copying slice pointers', () => {
  expect(interpret('let array = [1, 2, 3]; let x : *[I32] = &array; let y = x; y[0]')).toBe(1);
});

test('interpret handles array indexing bounds', () => {
  expect(interpret('let array = [1, 2, 3]; array[1]')).toBe(2);
  expect(() => interpret('let array = [1, 2, 3]; array[-1]')).toThrow();
  expect(() => interpret('let array = [1, 2, 3]; array[3]')).toThrow();
});

test('interpret enforces ordered array initialization', () => {
  expect(() => interpret('let mut array : [I32; 0; 3]; array[0]')).toThrow();
  expect(interpret('let mut array : [I32; 0; 3]; array[0] = 100; array[0]')).toBe(100);
  expect(() =>
    interpret('let mut array : [I32; 0; 3]; array[1] = 1; array[0] = 2; array[0]')
  ).toThrow();
});

test('interpret allows assigning into uninitialized arrays before passing', () => {
  expect(
    interpret(
      'let mut array : [I32; 0; 3]; array[0] = 100; fn getFirst(arr : [I32; 1; 3]) => arr[0]; getFirst(array)'
    )
  ).toBe(100);
});

test('interpret rejects passing arrays with insufficient initialized elements', () => {
  expect(() =>
    interpret(
      'let mut array : [I32; 0; 3]; fn getFirst(arr : [I32; 1; 3]) => arr[0]; getFirst(array)'
    )
  ).toThrow();
});

test('interpret rejects calling a non-function variable', () => {
  expect(() => interpret('let x = 100; x()')).toThrow(
    'function not found: x. Cause: call references an undefined function. Reason: functions must be declared before use. Fix: define fn x(...) or correct the call. Context: call expression x().'
  );
});

test('interpret reports missing method on value', () => {
  expect(() =>
    interpret('fn List<T>() => { let x = 1; this }; let list = List<I32>(); list.getFirst();')
  ).toThrow(
    'function not found: getFirst. Cause: call references an undefined function. Reason: functions must be declared before use. Fix: define fn getFirst(...) or correct the call. Context: method call list.getFirst().'
  );
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
