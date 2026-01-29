import { interpret } from '../src/index';

test('interpret ignores line comments', () => {
  expect(interpret('let x = 1; // comment\n x + 1')).toBe(2);
});

test('interpret ignores block comments', () => {
  expect(interpret('let x = 1; /* comment */ x + 2')).toBe(3);
});

test('interpret handles block comments with braces inside', () => {
  expect(interpret('let x = 1; /* { } */ x + 1')).toBe(2);
});
