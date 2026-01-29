import { add, interpretAll } from '../src/index';

test('add', () => {
  expect(add(1, 2)).toBe(3);
});

test('interpretAll supports explicit generic call syntax', () => {
  const config = new Map([
    [['main'], 'use { pass } from lib; pass<I32>(100)'],
    [['lib'], 'fn pass<T>(value : T) => value;'],
  ]);
  expect(interpretAll(['main'], config)).toBe(100);
});
