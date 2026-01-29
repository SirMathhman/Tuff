import { interpret } from '../src/index';

test('interpret supports string literals and indexing to get chars', () => {
  expect(interpret('let x : *Str = "test"; let y : Char = x[0]; y')).toBe(116); // 't'
});

test('interpret supports string indexing with different positions', () => {
  expect(interpret('let x : *Str = "hello"; x[1]')).toBe(101); // 'e'
  expect(interpret('let x : *Str = "hello"; x[4]')).toBe(111); // 'o'
});