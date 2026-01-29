import { interpret } from '../src/index';

test('interpret evaluates functions with parameters', () => {
  expect(interpret('fn add(first : I32, second : I32) => first + second; add(3, 4)')).toBe(7);
});

test('interpret rejects function calls with missing arguments', () => {
  expect(() => interpret('fn add(first : I32, second : I32) => first + second; add()')).toThrow(
    'function add expects 2 arguments, got 0'
  );
});

test('interpret rejects boolean arguments for numeric parameters', () => {
  expect(() =>
    interpret('fn add(first : I32, second : I32) => first + second; add(true, false)')
  ).toThrow('cannot convert Bool to numeric type');
});

test('interpret rejects assigning void call result to variable', () => {
  expect(() => interpret('fn empty() : Void => {}; let value = empty(); value')).toThrow(
    'void function cannot return a value'
  );
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

test('interpret handles function calls within function bodies', () => {
  expect(interpret('fn helper(x : I32) => x + 1; fn caller() => { helper(5) }; caller()')).toBe(6);
});

test('interpret handles nested this calls in function bodies', () => {
  expect(interpret('fn inner() => 100; fn outer() => { inner() }; outer()')).toBe(100);
});

test('interpret rejects assigning inferred void function result', () => {
  expect(() => interpret('fn outer() => {} let value = outer(); value')).toThrow(
    'void function cannot return a value'
  );
});

test('interpret rejects assigning implicit void from block with inner fn', () => {
  expect(() => interpret('fn outer() => { fn inner() => {} } let value = outer(); value')).toThrow(
    'void function cannot return a value'
  );
});

test('interpret allows consecutive fn declarations without semicolons', () => {
  expect(interpret('fn outer() => {\nfn a() => 1\nfn b() => 2\nb()\n} outer()')).toBe(2);
});

test('interpret supports generic identity function', () => {
  expect(interpret('fn pass<T>(value : T) => value; pass(100)')).toBe(100);
});

test('interpret rejects calling a non-function variable', () => {
  expect(() => {
    interpret('let x = 100; x()');
  }).toThrow();
});

test('interpret function definitions return 0', () => {
  expect(interpret('fn empty() : I32 => 100;')).toBe(0);
});

test('interpret rejects duplicate parameter names in functions', () => {
  expect(() => interpret('fn something(first : I32, first : I32) => {};')).toThrow(
    'duplicate parameter name: first'
  );
});

test('interpret supports void function definitions returning 0', () => {
  expect(interpret('fn empty() : Void => {};')).toBe(0);
});

test('interpret calls void functions and treats result as 0', () => {
  expect(interpret('fn empty() : Void => {}; empty()')).toBe(0);
});

test('interpret rejects bool function results assigned to numeric', () => {
  expect(() => interpret('fn empty() => true; let result : I32 = empty(); result')).toThrow(
    'cannot convert Bool to numeric type'
  );
});

test('interpret rejects duplicate function definitions', () => {
  expect(() => interpret('fn empty() : Void => {}; fn empty() : Void => {};')).toThrow(
    'function already defined: empty'
  );
});
