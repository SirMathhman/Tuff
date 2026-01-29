import { interpret } from '../src/index';

test('interpret supports method-style calls with this parameter', () => {
  expect(interpret('let x = 0; fn add(this : I32) => this + 1; 100.add()')).toBe(101);
});

test('interpret supports method-style calls with mutable pointer this', () => {
  expect(
    interpret(
      'let x = 0; fn addOnce(this : *mut I32) => *this = *this + 1; let mut y = 100; y.addOnce(); y'
    )
  ).toBe(101);
});

test('interpret reports missing method on value', () => {
  expect(() => {
    interpret('fn List<T>() => { let x = 1; this }; let list = List<I32>(); list.getFirst();');
  }).toThrow();
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