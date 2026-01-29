import { assertValid } from './utils';

test('interpret ignores line comments', () => {
  assertValid('let x = 1; // comment\n x + 1', 2);
});

test('interpret ignores block comments', () => {
  assertValid('let x = 1; /* comment */ x + 2', 3);
});

test('interpret handles block comments with braces inside', () => {
  assertValid('let x = 1; /* { } */ x + 1', 2);
});
