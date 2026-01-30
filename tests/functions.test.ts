import { assertInvalid, assertValid } from './utils';

test('evaluates functions with parameters', () => {
  assertValid('fn add(first : I32, second : I32) => first + second; add(3, 4)', 7);
});

test('rejects function calls with missing arguments', () => {
  assertInvalid('fn add(first : I32, second : I32) => first + second; add()');
});

test('rejects boolean arguments for numeric parameters', () => {
  assertInvalid('fn add(first : I32, second : I32) => first + second; add(true, false)');
});

test('rejects assigning void call result to variable', () => {
  assertInvalid('fn empty() : Void => {}; let value = empty(); value');
});

test('rejects boolean return for numeric function', () => {
  assertInvalid('fn empty() : I32 => true; empty()');
});

test('infers return type from function body when missing', () => {
  assertValid('fn empty() => true; let result = empty(); result', 1);
});

test('supports forward function references', () => {
  assertValid('fn getA() => getB(); fn getB() => 100; getA()', 100);
});

test('allows functions to access outer scope variables', () => {
  assertValid('let mut sum = 0; fn addOnce() => sum += 1; addOnce(); sum', 1);
});

test('handles function calls within function bodies', () => {
  assertValid('fn helper(x : I32) => x + 1; fn caller() => { helper(5) }; caller()', 6);
});

test('handles nested this calls in function bodies', () => {
  assertValid('fn inner() => 100; fn outer() => { inner() }; outer()', 100);
});

test('rejects assigning inferred void function result', () => {
  assertInvalid('fn outer() => {} let value = outer(); value');
});

test('rejects assigning implicit void from block with inner fn', () => {
  assertInvalid('fn outer() => { fn inner() => {} } let value = outer(); value');
});

test('allows consecutive fn declarations without semicolons', () => {
  assertValid('fn outer() => {\nfn a() => 1\nfn b() => 2\nb()\n} outer()', 2);
});

test('supports generic identity function', () => {
  assertValid('fn pass<T>(value : T) => value; pass(100)', 100);
});

test('rejects calling a non-function variable', () => {
  assertInvalid('let x = 100; x()');
});

test('function definitions return 0', () => {
  assertValid('fn empty() : I32 => 100;', 0);
});

test('rejects duplicate parameter names in functions', () => {
  assertInvalid('fn something(first : I32, first : I32) => {};');
});

test('supports void function definitions returning 0', () => {
  assertValid('fn empty() : Void => {};', 0);
});

test('calls void functions and treats result as 0', () => {
  assertValid('fn empty() : Void => {}; empty()', 0);
});

test('rejects bool function results assigned to numeric', () => {
  assertInvalid('fn empty() => true; let result : I32 = empty(); result');
});

test('rejects duplicate function definitions', () => {
  assertInvalid('fn empty() : Void => {}; fn empty() : Void => {};');
});
