import { assertValid } from './utils';

test('interpret supports singleton object methods updating state', () => {
    assertValid('object MySingleton { let mut counter = 0; fn add() => counter += 1; } MySingleton.add(); MySingleton.counter', 1);
});

test('interpret supports singleton pointer identity equality', () => {
    assertValid('object MySingleton {} &MySingleton == &MySingleton', 1);
});

test('interpret supports generic singleton pointer equality', () => {
    assertValid('object None<T> {} let a = &None<I32>; let b = &None<I32>; a == b', 1);
});

test('interpret supports generic singleton pointer inequality across types', () => {
    assertValid('object None<T> {} &None<I32> == &None<Bool>', 0);
});

test('interpret treats pointer vs value as unequal for generics', () => {
    assertValid('object None<T> {} &None<I32> == None<I32>', 0);
});
