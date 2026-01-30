import { assertValid } from './utils';

test('interpret accesses .length property on dereferenced strings', () => {
  assertValid('let x : *Str = "test"; x.length', 4);
  assertValid('let x : *Str = "hello"; x.length', 5);
  assertValid('let x : *Str = ""; x.length', 0);
});
