import { assertValid } from './utils';

test('functions can be defined with closure type parameters', () => {
  const code = `
    fn apply(func : () => I32) => 100;
    0
  `;
  assertValid(code, 0);
});

test('functions can be defined with closure types with parameters', () => {
  const code = `
    fn apply(func : (I32) => I32, value : I32) => value;
    0
  `;
  assertValid(code, 0);
});

test('functions with multiple parameters including closures', () => {
  const code = `
    fn describe(desc : I32, func : () => I32) => desc;
    0
  `;
  assertValid(code, 0);
});

test('functions with void closure parameters', () => {
  const code = `
    fn describe(testSetDesc : *Str, func : () => Void) => 50;
    fn it(testDesc : *Str, callback : () => Void) => 50;
    0
  `;
  assertValid(code, 0);
});
