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
