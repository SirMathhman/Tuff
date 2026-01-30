import { assertValid } from './utils';

test('interpret is a stub that returns 0 for empty input', () => {
  assertValid('', 0);
});

test('interpret returns 0 for arbitrary input (stub)', () => {
  assertValid('some input', 0);
});
