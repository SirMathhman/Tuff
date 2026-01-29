import { interpret } from '../src/index';

test('interpret ignores struct declarations', () => {
  expect(interpret('struct Empty {}')).toBe(0);
});

test('interpret rejects duplicate struct declarations', () => {
  expect(() => interpret('struct Empty {} struct Empty {}')).toThrow(
    'struct already defined: Empty'
  );
});

test('interpret rejects duplicate struct fields', () => {
  expect(() => interpret('struct Empty { x : I32; x : I32; }')).toThrow(
    'duplicate struct field: x'
  );
});

test('interpret allows structs with multiple fields', () => {
  expect(interpret('struct Point { x : I32; y : I32; }')).toBe(0);
});

test('interpret accesses struct field through variable', () => {
  expect(
    interpret('struct Wrapper { x : I32; } let value : Wrapper = Wrapper { 100 }; value.x')
  ).toBe(100);
});

test('interpret rejects struct instantiation with missing fields', () => {
  expect(() =>
    interpret('struct Wrapper { x : I32; } let value : Wrapper = Wrapper {}; value.x')
  ).toThrow();
});

test('interpret rejects access to non-existent struct field', () => {
  expect(() =>
    interpret('struct Wrapper { x : I32; } let value = Wrapper { 100 }; value.y')
  ).toThrow();
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
