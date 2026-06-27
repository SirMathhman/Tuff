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

test('execute("2 + 3 * 4") => 14', () => {
  expect(execute("2 + 3 * 4")).toBe(14);
});

test('execute("8 / 4") => 2', () => {
  expect(execute("8 / 4")).toBe(2);
});

test('execute("(2 + 3) * 4") => 20', () => {
  expect(execute("(2 + 3) * 4")).toBe(20);
});

test('execute("{ 2 + 3 } * 4") => 20', () => {
  expect(execute("{ 2 + 3 } * 4")).toBe(20);
});

test('execute("{ let x = 2 + 3; x } * 4") => 20', () => {
  expect(execute("{ let x = 2 + 3; x } * 4")).toBe(20);
});

test('execute("{ 5 + 3; } * 4") should throw error', () => {
  expect(() => execute("{ 5 + 3; } * 4")).toThrow();
});

test('execute("let y = { let x = 2 + 3; x } * 4; y") => 20', () => {
  expect(execute("let y = { let x = 2 + 3; x } * 4; y")).toBe(20);
});

test('execute("abc") throws error', () => {
  expect(() => execute("abc")).toThrow();
});
