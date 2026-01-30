import { assertValid } from './utils';

test('supports type aliases and is operator', () => {
  assertValid('type MyAlias = I32; let temp : MyAlias = 100; temp is I32 && temp is MyAlias', 1);
});

test('supports forward type alias references', () => {
  assertValid('let temp : MyAlias = 100; type MyAlias = I32; temp is I32 && temp is MyAlias', 1);
});

test('supports drop functions for type aliases', () => {
  assertValid('let mut sum = 0; fn drop(this : MyDroppable) => sum += this; type MyDroppable = I32 then drop; let temp : MyDroppable = 100; sum', 100);
});

test('supports generic type aliases', () => {
  assertValid('type Wrapper<T> = T; let temp : Wrapper<I32> = 100; temp', 100);
});

test('supports generic type aliases with pointer types', () => {
  assertValid('type Ptr<T> = *T; let x = 100; let p : Ptr<I32> = &x; *p', 100);
});

test('supports generic type aliases with drop functions', () => {
  assertValid('let mut sum = 0; fn cleanup(this : I32) => sum += this; type Alloc<T> = T then cleanup; let x = 50; let p : Alloc<I32> = x; sum', 50);
});
