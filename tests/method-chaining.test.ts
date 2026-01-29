import { interpret } from '../src/index';

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
