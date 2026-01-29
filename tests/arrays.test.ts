import { interpret } from '../src/index';

test('interpret rejects assigning inferred void function result', () => {
  expect(() => interpret('fn outer() => {} let value = outer(); value')).toThrow(
    'void function cannot return a value'
  );
});

test('interpret rejects assigning implicit void from block with inner fn', () => {
  expect(() =>
    interpret('fn outer() => { fn inner() => {} } let value = outer(); value')
  ).toThrow('void function cannot return a value');
});

test('interpret allows consecutive fn declarations without semicolons', () => {
  expect(
    interpret('fn outer() => {\nfn a() => 1\nfn b() => 2\nb()\n} outer()')
  ).toBe(2);
});

test('interpret rejects array element type mismatch', () => {
  expect(() => interpret('let array : [I32; 1; 1] = [true]; array[0]')).toThrow();
});

test('interpret rejects array initializer with too few elements', () => {
  expect(() => interpret('let array : [I32; 3; 3] = [1, 2]')).toThrow();
});

test('interpret enforces numeric type constraints in declarations', () => {
  expect(interpret('let x : I32 < 10 = 5; x')).toBe(5);
  expect(() => interpret('let x : I32 < 10 = 20; x')).toThrow();
});

test('interpret supports type aliases and is operator', () => {
  expect(
    interpret('type MyAlias = I32; let temp : MyAlias = 100; temp is I32 && temp is MyAlias')
  ).toBe(1);
});

test('interpret supports forward type alias references', () => {
  expect(
    interpret('let temp : MyAlias = 100; type MyAlias = I32; temp is I32 && temp is MyAlias')
  ).toBe(1);
});

test('interpret supports generic structs', () => {
  expect(
    interpret('struct Wrapper<T> { field : T; } let wrapper : Wrapper<I32> = Wrapper<I32> { 100 }; wrapper.field')
  ).toBe(100);
});

test('interpret supports generic structs with type checking', () => {
  expect(
    interpret('struct Wrapper<T> { field : T; } let wrapper = Wrapper<Bool> { true }; wrapper.field is I32')
  ).toBe(0);
});

test('interpret supports USize type', () => {
  expect(interpret('let x : USize = 100USize; x')).toBe(100);
});

