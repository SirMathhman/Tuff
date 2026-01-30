import { assertInvalid, assertValid } from './utils';

test('ignores struct declarations', () => {
  assertValid('struct Empty {}', 0);
});

test('rejects duplicate struct declarations', () => {
  assertInvalid('struct Empty {} struct Empty {}');
});

test('rejects duplicate struct fields', () => {
  assertInvalid('struct Empty { x : I32; x : I32; }');
});

test('allows structs with multiple fields', () => {
  assertValid('struct Point { x : I32; y : I32; }', 0);
});

test('accesses struct field through variable', () => {
  assertValid('struct Wrapper { x : I32; } let value : Wrapper = Wrapper { 100 }; value.x', 100);
});

test('rejects struct instantiation with missing fields', () => {
  assertInvalid('struct Wrapper { x : I32; } let value : Wrapper = Wrapper {}; value.x');
});

test('rejects access to non-existent struct field', () => {
  assertInvalid('struct Wrapper { x : I32; } let value = Wrapper { 100 }; value.y');
});

test('supports generic structs', () => {
  assertValid('struct Wrapper<T> { field : T; } let wrapper : Wrapper<I32> = Wrapper<I32> { 100 }; wrapper.field', 100);
});

test('supports generic structs with type checking', () => {
  assertValid('struct Wrapper<T> { field : T; } let wrapper = Wrapper<Bool> { true }; wrapper.field is I32', 0);
});
