import { assertInvalid, assertValid } from './utils';

test('interpret accesses variables through this.x notation', () => {
  assertValid('let x = 100; this.x', 100);
});

test('interpret rejects this.x when variable does not exist', () => {
  assertInvalid('let y = 100; this.x');
});

test('interpret allows assignment through this.x notation', () => {
  assertValid('let mut x = 0; this.x = 100; x', 100);
});

test('interpret rejects assignment through this.x when variable is immutable', () => {
  assertInvalid('let x = 0; this.x = 100; x');
});

test('interpret supports this pointer type and dereference', () => {
  assertValid('let x = 100; let self : *This = &this; self.x', 100);
});

test('interpret supports mutable this pointer and assignment', () => {
  assertValid('let mut x = 0; let self : *mut This = &mut this; self.x = 100; x', 100);
});

test('interpret supports function calls through this notation', () => {
  assertValid('fn get() => 100; this.get()', 100);
});

test('interpret allows functions to return this scope values', () => {
  assertValid('fn Wrap(x : I32) => this; Wrap(100).x', 100);
});

test('interpret function returning this creates a class-like object', () => {
  assertValid('fn Point(x : I32, y : I32) => { this }; Point(3, 4).x', 3);
});

test('interpret allows returning this with inner function', () => {
  assertValid('fn outer() => { fn inner() => 100; this } outer().inner()', 100);
});

test('interpret allows returned this to capture parameters', () => {
  assertValid('fn outer(x : I32, y : I32) => { fn inner() => x + y; this } outer(3, 4).inner()', 7);
});

test('interpret allows binding inner function from returned this', () => {
  assertValid(
    'fn outer(x : I32, y : I32) => { fn inner() => x + y; this } let myOuter : outer = outer(3, 4); let myInnerFunc : () => I32 = myOuter.inner; myInnerFunc()',
    7
  );
});

test('interpret supports nested this with uppercase function names', () => {
  assertValid(
    'fn OuterClass(x : I32) => { fn InnerClass(y : I32) => { fn manhattan() => x + y; this } this } OuterClass(3).InnerClass(4).manhattan()',
    7
  );
});

test('interpret nested functions each get their own this context', () => {
  assertValid(
    'fn Outer() => {' +
      '  let x = 100;' +
      '  fn Inner() => {' +
      '    let y = 50;' +
      '    this' +
      '  }' +
      '  Inner().y' +
      '}; ' +
      'Outer()',
    50
  );
});

test('interpret this.this in nested function accesses outer function scope', () => {
  assertValid(
    'fn Outer() => {' +
      '  let x = 100;' +
      '  fn Inner() => {' +
      '    let y = 50;' +
      '    this.this' +
      '  }' +
      '  Inner().x' +
      '}; ' +
      'Outer()',
    100
  );
});

test('interpret deep nesting requires multiple this accessors', () => {
  assertValid(
    'fn Level1() => {' +
      '  let a = 1;' +
      '  fn Level2() => {' +
      '    let b = 2;' +
      '    fn Level3() => {' +
      '      let c = 3;' +
      '      this.this.this' +
      '    }' +
      '    Level3().a' +
      '  }' +
      '  Level2()' +
      '}; ' +
      'Level1()',
    1
  );
});
