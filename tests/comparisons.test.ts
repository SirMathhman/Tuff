import { assertInvalid, assertValid } from './utils';

test('interpret supports less-than comparison operator', () => {
  assertValid('let x = 0; let y = 1; x < y', 1);
  assertValid('let x = 1; let y = 0; x < y', 0);
});

test('interpret supports all comparison operators', () => {
  assertValid('1 < 2', 1);
  assertValid('2 < 1', 0);
  assertValid('1 <= 1', 1);
  assertValid('1 <= 0', 0);
  assertValid('2 > 1', 1);
  assertValid('1 > 2', 0);
  assertValid('1 >= 1', 1);
  assertValid('0 >= 1', 0);
  assertValid('1 == 1', 1);
  assertValid('1 == 2', 0);
  assertValid('1 != 2', 1);
  assertValid('1 != 1', 0);
});

test('interpret rejects equality comparison between different types (number and bool)', () => {
  assertInvalid('100 == true');
});
