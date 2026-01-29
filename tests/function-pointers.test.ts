import { interpret } from '../src/index';

test('interpret supports function pointers and calling through them', () => {
  expect(interpret('fn get() => 100; let func : () => I32 = get; func()')).toBe(100);
});

test('interpret supports returning function pointers from functions', () => {
  expect(interpret('fn get() => 100; fn pass() : () => I32 => get; pass()()')).toBe(100);
});

test('interpret allows returning inner functions from blocks', () => {
  expect(interpret('fn outer() => { fn inner() => 100; inner } outer()()')).toBe(100);
});

test('interpret allows extracting unbound function pointer with :: and calling with explicit context', () => {
  expect(
    interpret(
      'fn outer(x : I32, y : I32) => { fn inner() => x + y; this } let myOuter : outer = outer(3, 4); let myInnerFuncPtr : *(*outer) => I32 = myOuter::inner; myInnerFuncPtr(&myOuter)'
    )
  ).toBe(7);
});