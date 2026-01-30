import { assertInvalid, assertValid } from './utils';

test('interpret handles while loops', () => {
  assertValid('let mut x = 0; while (x < 4) x += 1; x', 4);
});

test('interpret handles while loops with braces', () => {
  assertValid('let mut x = 0; while (x < 4) { x += 1; } x', 4);
});

test('interpret rejects non-boolean while conditions', () => {
  assertInvalid('let mut x = 0; while (100) x += 1; x');
});
