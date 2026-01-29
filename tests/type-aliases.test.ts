import { interpret } from '../src/index';

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

test('interpret supports drop functions for type aliases', () => {
  expect(
    interpret(
      'let mut sum = 0; fn drop(this : MyDroppable) => sum += this; type MyDroppable = I32 then drop; let temp : MyDroppable = 100; sum'
    )
  ).toBe(100);
});