import { assertInvalid, assertValid } from './utils';

test('rejects array element type mismatch', () => {
  assertInvalid('let array : [I32; 1; 1] = [true]; array[0]');
});

test('rejects array initializer with too few elements', () => {
  assertInvalid('let array : [I32; 3; 3] = [1, 2]');
});
test('creates and accesses arrays with indexing', () => {
  assertValid('let array : [I32; 1; 1] = [100]; array[0]', 100);
});

test('indexes array literals directly', () => {
  assertValid('[1, 2, 3][1]', 2);
});

test('indexes arrays returned by calls', () => {
  assertValid('fn getFirst() => [1, 2, 3]; getFirst()[1]', 2);
});

test('assigns array element with variable index', () => {
  assertValid(
    'let mut array : [I32; 0; 2]; let mut idx : USize = 0; array[idx] = 100; array[0]',
    100
  );
});

test('rejects copying arrays', () => {
  assertInvalid('let array : [I32; 3; 3] = [1, 2, 3]; let array0 = array;');
});

test('supports slice pointer indexing', () => {
  assertValid(
    'let array = [1, 2, 3]; let slice : *[I32] = &array; slice[0] + slice[1] + slice[2]',
    6
  );
});

test('allows copying slice pointers', () => {
  assertValid('let array = [1, 2, 3]; let x : *[I32] = &array; let y = x; y[0]', 1);
});

test('handles array indexing bounds', () => {
  assertValid('let array = [1, 2, 3]; array[1]', 2);
  assertInvalid('let array = [1, 2, 3]; array[-1]');
  assertInvalid('let array = [1, 2, 3]; array[3]');
});

test('enforces ordered array initialization', () => {
  assertInvalid('let mut array : [I32; 0; 3]; array[0]');
  assertValid('let mut array : [I32; 0; 3]; array[0] = 100; array[0]', 100);
  assertInvalid('let mut array : [I32; 0; 3]; array[1] = 1; array[0] = 2; array[0]');
});

test('allows assigning into uninitialized arrays before passing', () => {
  assertValid(
    'let mut array : [I32; 0; 3]; array[0] = 100; fn getFirst(arr : [I32; 1; 3]) => arr[0]; getFirst(array)',
    100
  );
});

test('rejects passing arrays with insufficient initialized elements', () => {
  assertInvalid(
    'let mut array : [I32; 0; 3]; fn getFirst(arr : [I32; 1; 3]) => arr[0]; getFirst(array)'
  );
});
