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

test('interpret supports generic structs', () => {
  expect(
    interpret(
      'struct Wrapper<T> { field : T; } let wrapper : Wrapper<I32> = Wrapper<I32> { 100 }; wrapper.field'
    )
  ).toBe(100);
});

test('interpret supports generic structs with type checking', () => {
  expect(
    interpret(
      'struct Wrapper<T> { field : T; } let wrapper = Wrapper<Bool> { true }; wrapper.field is I32'
    )
  ).toBe(0);
});
