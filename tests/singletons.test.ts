import { assertValid } from './utils';

test('interpret supports singleton object methods updating state', () => {
  assertValid(
    'object MySingleton { let mut counter = 0; fn add() => counter += 1; } MySingleton.add(); MySingleton.counter',
    1
  );
});

test('interpret supports singleton pointer identity equality', () => {
  assertValid('object MySingleton {} &MySingleton == &MySingleton', 1);
});
