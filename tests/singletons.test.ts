import { interpret } from '../src/index';

test('interpret supports singleton object methods updating state', () => {
  expect(
    interpret(
      'object MySingleton { let mut counter = 0; fn add() => counter += 1; } MySingleton.add(); MySingleton.counter'
    )
  ).toBe(1);
});

test('interpret supports singleton pointer identity equality', () => {
  expect(interpret('object MySingleton {} &MySingleton == &MySingleton')).toBe(1);
});