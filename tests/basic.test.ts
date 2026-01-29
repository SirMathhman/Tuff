import { interpret } from '../src/index';

test('interpret is a stub that returns 0 for empty input', () => {
  expect(interpret('')).toBe(0);
});

test('interpret returns 0 for arbitrary input (stub)', () => {
  expect(interpret('some input')).toBe(0);
});
