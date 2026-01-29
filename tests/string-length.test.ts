import { interpret } from '../src/index';

test('interpret accesses .length property on dereferenced strings', () => {
  expect(interpret('let x : *Str = "test"; x.length')).toBe(4);
  expect(interpret('let x : *Str = "hello"; x.length')).toBe(5);
  expect(interpret('let x : *Str = ""; x.length')).toBe(0);
});