import { interpret } from '../src/index';

test('interpret accesses variables through this.x notation', () => {
  expect(interpret('let x = 100; this.x')).toBe(100);
});

test('interpret rejects this.x when variable does not exist', () => {
  expect(() => interpret('let y = 100; this.x')).toThrow('undefined variable: x');
});

test('interpret allows assignment through this.x notation', () => {
  expect(interpret('let mut x = 0; this.x = 100; x')).toBe(100);
});

test('interpret rejects assignment through this.x when variable is immutable', () => {
  expect(() => interpret('let x = 0; this.x = 100; x')).toThrow(
    'cannot assign to immutable variable'
  );
});

test('interpret supports this pointer type and dereference', () => {
  expect(interpret('let x = 100; let self : *This = &this; self.x')).toBe(100);
});

test('interpret supports mutable this pointer and assignment', () => {
  expect(interpret('let mut x = 0; let self : *mut This = &mut this; self.x = 100; x')).toBe(100);
});

test('interpret supports function calls through this notation', () => {
  expect(interpret('fn get() => 100; this.get()')).toBe(100);
});

test('interpret allows functions to return this scope values', () => {
  expect(interpret('fn Wrap(x : I32) => this; Wrap(100).x')).toBe(100);
});

test('interpret function returning this creates a class-like object', () => {
  expect(interpret('fn Point(x : I32, y : I32) => { this }; Point(3, 4).x')).toBe(3);
});

test('interpret allows returning this with inner function', () => {
  expect(interpret('fn outer() => { fn inner() => 100; this } outer().inner()')).toBe(100);
});

test('interpret allows returned this to capture parameters', () => {
  expect(
    interpret('fn outer(x : I32, y : I32) => { fn inner() => x + y; this } outer(3, 4).inner()')
  ).toBe(7);
});

test('interpret allows binding inner function from returned this', () => {
  expect(
    interpret(
      'fn outer(x : I32, y : I32) => { fn inner() => x + y; this } let myOuter : outer = outer(3, 4); let myInnerFunc : () => I32 = myOuter.inner; myInnerFunc()'
    )
  ).toBe(7);
});

test('interpret supports nested this with uppercase function names', () => {
  expect(
    interpret(
      'fn OuterClass(x : I32) => { fn InnerClass(y : I32) => { fn manhattan() => x + y; this } this } OuterClass(3).InnerClass(4).manhattan()'
    )
  ).toBe(7);
});

test('interpret nested functions each get their own this context', () => {
  expect(
    interpret(
      'fn Outer() => {' +
        '  let x = 100;' +
        '  fn Inner() => {' +
        '    let y = 50;' +
        '    this' +
        '  }' +
        '  Inner().y' +
        '}; ' +
        'Outer()'
    )
  ).toBe(50);
});

test('interpret this.this in nested function accesses outer function scope', () => {
  expect(
    interpret(
      'fn Outer() => {' +
        '  let x = 100;' +
        '  fn Inner() => {' +
        '    let y = 50;' +
        '    this.this' +
        '  }' +
        '  Inner().x' +
        '}; ' +
        'Outer()'
    )
  ).toBe(100);
});

test('interpret deep nesting requires multiple this accessors', () => {
  expect(
    interpret(
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
        'Level1()'
    )
  ).toBe(1);
});