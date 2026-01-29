import { interpret } from '../src/index';

test('interpret evaluates functions with parameters', () => {
  expect(
    interpret('fn add(first : I32, second : I32) => first + second; add(3, 4)')
  ).toBe(7);
});

test('interpret rejects function calls with missing arguments', () => {
  expect(() =>
    interpret('fn add(first : I32, second : I32) => first + second; add()')
  ).toThrow('function add expects 2 arguments, got 0');
});

test('interpret rejects boolean arguments for numeric parameters', () => {
  expect(() =>
    interpret('fn add(first : I32, second : I32) => first + second; add(true, false)')
  ).toThrow('cannot convert Bool to numeric type');
});

test('interpret rejects assigning void call result to variable', () => {
  expect(() =>
    interpret('fn empty() : Void => {}; let value = empty(); value')
  ).toThrow('void function cannot return a value');
});

test('interpret rejects boolean return for numeric function', () => {
  expect(() => interpret('fn empty() : I32 => true; empty()')).toThrow(
    'cannot return boolean value from non-bool function'
  );
});

test('interpret infers return type from function body when missing', () => {
  expect(interpret('fn empty() => true; let result = empty(); result')).toBe(1);
});

test('interpret supports forward function references', () => {
  expect(interpret('fn getA() => getB(); fn getB() => 100; getA()')).toBe(100);
});
test('interpret allows functions to access outer scope variables', () => {
  expect(interpret('let mut sum = 0; fn addOnce() => sum += 1; addOnce(); sum')).toBe(1);
});
test('interpret supports drop functions for type aliases', () => {
  expect(
    interpret(
      'let mut sum = 0; fn drop(this : MyDroppable) => sum += this; type MyDroppable = I32 then drop; let temp : MyDroppable = 100; sum'
    )
  ).toBe(100);
});

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

test('interpret supports function pointers and calling through them', () => {
  expect(
    interpret('fn get() => 100; let func : () => I32 = get; func()')
  ).toBe(100);
});

test('interpret supports returning function pointers from functions', () => {
  expect(interpret('fn get() => 100; fn pass() : () => I32 => get; pass()()')).toBe(100);
});

test('interpret allows returning inner functions from blocks', () => {
  expect(interpret('fn outer() => { fn inner() => 100; inner } outer()()')).toBe(100);
});

test('interpret allows returning this with inner function', () => {
  expect(interpret('fn outer() => { fn inner() => 100; this } outer().inner()')).toBe(100);
});

test('interpret allows returned this to capture parameters', () => {
  expect(
    interpret('fn outer(x : I32, y : I32) => { fn inner() => x + y; this } outer(3, 4).inner()')
  ).toBe(7);
});

