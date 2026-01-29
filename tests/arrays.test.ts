import { interpret } from '../src/index';

test('interpret rejects array element type mismatch', () => {
  expect(() => interpret('let array : [I32; 1; 1] = [true]; array[0]')).toThrow();
});

test('interpret rejects array initializer with too few elements', () => {
  expect(() => interpret('let array : [I32; 3; 3] = [1, 2]')).toThrow();
});
test('interpret creates and accesses arrays with indexing', () => {
  expect(interpret('let array : [I32; 1; 1] = [100]; array[0]')).toBe(100);
});

test('interpret indexes array literals directly', () => {
  expect(interpret('[1, 2, 3][1]')).toBe(2);
});

test('interpret indexes arrays returned by calls', () => {
  expect(interpret('fn getFirst() => [1, 2, 3]; getFirst()[1]')).toBe(2);
});

test('interpret assigns array element with variable index', () => {
  expect(
    interpret('let mut array : [I32; 0; 2]; let mut idx : USize = 0; array[idx] = 100; array[0]')
  ).toBe(100);
});

test('interpret rejects copying arrays', () => {
  expect(() => {
    interpret('let array : [I32; 3; 3] = [1, 2, 3]; let array0 = array;');
  }).toThrow();
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
  expect(() => {
    interpret('let array = [1, 2, 3]; array[-1]');
  }).toThrow();
  expect(() => {
    interpret('let array = [1, 2, 3]; array[3]');
  }).toThrow();
});

test('interpret enforces ordered array initialization', () => {
  expect(() => {
    interpret('let mut array : [I32; 0; 3]; array[0]');
  }).toThrow();
  expect(interpret('let mut array : [I32; 0; 3]; array[0] = 100; array[0]')).toBe(100);
  expect(() => {
    interpret('let mut array : [I32; 0; 3]; array[1] = 1; array[0] = 2; array[0]');
  }).toThrow();
});

test('interpret allows assigning into uninitialized arrays before passing', () => {
  expect(
    interpret(
      'let mut array : [I32; 0; 3]; array[0] = 100; fn getFirst(arr : [I32; 1; 3]) => arr[0]; getFirst(array)'
    )
  ).toBe(100);
});

test('interpret rejects passing arrays with insufficient initialized elements', () => {
  expect(() => {
    interpret(
      'let mut array : [I32; 0; 3]; fn getFirst(arr : [I32; 1; 3]) => arr[0]; getFirst(array)'
    );
  }).toThrow();
});
