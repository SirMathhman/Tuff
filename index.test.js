import { execute } from ".";

test('execute("") => 0', () => {
  expect(execute("")).toBe(0);
});

test('execute(" ") => 0', () => {
  expect(execute(" ")).toBe(0);
});

test('execute("1") => 1', () => {
  expect(execute("1")).toBe(1);
});

test('execute("1 + 2") => 3', () => {
  expect(execute("1 + 2")).toBe(3);
});

test('execute("2 + 3 + 4") => 9', () => {
  expect(execute("2 + 3 + 4")).toBe(9);
});

test('execute("2 + 3 - 4") => 1', () => {
  expect(execute("2 + 3 - 4")).toBe(1);
});

test('execute("2 * 3 - 4") => 2', () => {
  expect(execute("2 * 3 - 4")).toBe(2);
});
