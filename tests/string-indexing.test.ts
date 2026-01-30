import { assertValid } from './utils';

test('interpret supports string literals and indexing to get chars', () => {
  assertValid('let x : *Str = "test"; let y : Char = x[0]; y', 116); // 't'
});

test('interpret supports string indexing with different positions', () => {
  assertValid('let x : *Str = "hello"; x[1]', 101); // 'e'
  assertValid('let x : *Str = "hello"; x[4]', 111); // 'o'
});
