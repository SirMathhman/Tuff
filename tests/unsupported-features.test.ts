import { assertInvalid } from './utils';

describe('Unsupported features', () => {
  test('rejects union type syntax with |>', () => {
    assertInvalid('type Option<T> = Some<T> |> None<T>;');
  });

  test('rejects varargs in function parameters', () => {
    assertInvalid('extern fn format(message : *Str, ...args : [I32; 0; 10]);');
  });

  test('rejects try operator ?', () => {
    assertInvalid('let x = if (true) ? 1 else 2;');
  });

  test('rejects label syntax', () => {
    assertInvalid('fn test() => { pass : this }');
  });

  test('rejects module keyword', () => {
    assertInvalid('module TestModule { let x = 1; }');
  });

  test('rejects triple-quoted strings', () => {
    assertInvalid('let x : *Str = """hello\nworld""";');
  });

  test('rejects Any type', () => {
    assertInvalid('extern fn test(x : Any);');
  });

  test('rejects array wildcard in type', () => {
    assertInvalid('let x : [I32; _; _];');
  });
});
