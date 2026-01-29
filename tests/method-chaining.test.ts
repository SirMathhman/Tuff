import { interpret } from '../src/index';

test('interpret accesses .length property on dereferenced strings', () => {
  expect(interpret('let x : *Str = "test"; x.length')).toBe(4);
  expect(interpret('let x : *Str = "hello"; x.length')).toBe(5);
  expect(interpret('let x : *Str = ""; x.length')).toBe(0);
});

test('interpret handles block comments with braces inside', () => {
  expect(interpret('let x = 1; /* { } */ x + 1')).toBe(2);
});

test('interpret handles function calls within function bodies', () => {
  expect(interpret('fn helper(x : I32) => x + 1; fn caller() => { helper(5) }; caller()')).toBe(6);
});

test('interpret handles nested this calls in function bodies', () => {
  expect(interpret('fn inner() => 100; fn outer() => { inner() }; outer()')).toBe(100);
});

test('interpret handles function calls with this.method() inside arguments', () => {
  // This test ensures that set(this.size()) is not misparsed as a method call on set()
  expect(
    interpret(
      'fn List() => { fn set(x : I32) => { 100 } fn size() => 50; ' +
        'fn add(element : I32) => { set(this.size()) } ' +
        'this }; List().add(5)'
    )
  ).toBe(100);
});

test('interpret this returns a snapshot of the current scope', () => {
  expect(interpret('let x = 100; this.x')).toBe(100);
});

test('interpret function returning this creates a class-like object', () => {
  expect(interpret('fn Point(x : I32, y : I32) => { this }; Point(3, 4).x')).toBe(3);
});

test('interpret method returning this returns the method context not outer scope', () => {
  // setValue returns its own context (like an inner class), which has field 'v'
  expect(
    interpret(
      'fn Builder() => {' +
        '  let mut value = 0;' +
        '  fn setValue(v : I32) => { this.value = v; this }' +
        '  this' +
        '}; ' +
        'Builder().setValue(42).v'
    )
  ).toBe(42);
});

test('interpret this.this accesses outer scope from method for chaining', () => {
  expect(
    interpret(
      'fn Builder() => {' +
        '  let mut value = 0;' +
        '  fn setValue(v : I32) => { this.value = v; this.this }' +
        '  this' +
        '}; ' +
        'Builder().setValue(42).value'
    )
  ).toBe(42);
});

test('interpret method chaining with this.this', () => {
  expect(
    interpret(
      'fn Counter() => {' +
        '  let mut count = 0;' +
        '  fn add(n : I32) => { this.count = this.count + n; this.this }' +
        '  this' +
        '}; ' +
        'let c = Counter();' +
        'c.add(10).add(5).count'
    )
  ).toBe(15);
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

test('interpret method can modify outer scope through this reference', () => {
  expect(
    interpret(
      'fn Builder() => {' +
        '  let mut value = 0;' +
        '  fn increment() => { this.value = this.value + 1; this.this }' +
        '  this' +
        '}; ' +
        'let b = Builder();' +
        'b.increment();' +
        'b.value'
    )
  ).toBe(1);
});

test('interpret deep nesting requires multiple this accessors', () => {
  // This demonstrates the "code smell" - this.this.this suggests bad architecture
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
