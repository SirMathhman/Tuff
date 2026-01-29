import { interpret } from '../src/index';

test('interpret allows binding inner function from returned this', () => {
  expect(
    interpret(
      'fn outer(x : I32, y : I32) => { fn inner() => x + y; this } let myOuter : outer = outer(3, 4); let myInnerFunc : () => I32 = myOuter.inner; myInnerFunc()'
    )
  ).toBe(7);
});

test('interpret allows extracting unbound function pointer with :: and calling with explicit context', () => {
  expect(
    interpret(
      'fn outer(x : I32, y : I32) => { fn inner() => x + y; this } let myOuter : outer = outer(3, 4); let myInnerFuncPtr : *(*outer) => I32 = myOuter::inner; myInnerFuncPtr(&myOuter)'
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

test('interpret supports method chaining across lines', () => {
  expect(
    interpret(
      'fn Builder() => { let mut value = 0; fn add() => { value += 1; this.this } fn get() => value; this } Builder()\n  .add()\n  .get()'
    )
  ).toBe(1);
});

test('interpret supports returning this from inner function and reusing it', () => {
  expect(
    interpret(
      'fn outer(x : I32) => { fn inner() => this; this } let temp = outer(100); let inner = temp.inner(); let newOuter = inner.this; newOuter.x'
    )
  ).toBe(100);
});

