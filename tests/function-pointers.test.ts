import { assertValid } from './utils';

test('interpret supports function pointers and calling through them', () => {
  assertValid('fn get() => 100; let func : () => I32 = get; func()', 100);
});

test('interpret supports returning function pointers from functions', () => {
  assertValid('fn get() => 100; fn pass() : () => I32 => get; pass()()', 100);
});

test('interpret allows returning inner functions from blocks', () => {
  assertValid('fn outer() => { fn inner() => 100; inner } outer()()', 100);
});

test('interpret allows extracting unbound function pointer with :: and calling with explicit context', () => {
  assertValid(
    'fn outer(x : I32, y : I32) => { fn inner() => x + y; this } let myOuter : outer = outer(3, 4); let myInnerFuncPtr : *(*outer) => I32 = myOuter::inner; myInnerFuncPtr(&myOuter)',
    7
  );
});
