import { interpret } from '../src/index';

test('interpret supports singleton object methods updating state', () => {
  expect(
    interpret(
      'object MySingleton { let mut counter = 0; fn add() => counter += 1; } MySingleton.add(); MySingleton.counter'
    )
  ).toBe(1);
});

test('interpret allows functions to return this scope values', () => {
  expect(interpret('fn Wrap(x : I32) => this; Wrap(100).x')).toBe(100);
});

test('interpret supports method-style calls with this parameter', () => {
  expect(interpret('let x = 0; fn add(this : I32) => this + 1; 100.add()')).toBe(101);
});

test('interpret supports method-style calls with mutable pointer this', () => {
  expect(
    interpret(
      'let x = 0; fn addOnce(this : *mut I32) => *this = *this + 1; let mut y = 100; y.addOnce(); y'
    )
  ).toBe(101);
});

test('interpret supports singleton pointer identity equality', () => {
  expect(interpret('object MySingleton {} &MySingleton == &MySingleton')).toBe(1);
});

test('interpret distinguishes pointers to different variables', () => {
  expect(interpret('let x = 0; let y = 0; &x == &y')).toBe(0);
});

test('interpret supports char literals and returns UTF-8 code', () => {
  expect(interpret("let x : Char = 'a'; x")).toBe(97);
});

