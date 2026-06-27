import { execute } from ".";

test('execute("") => 0', () => {
  expect(execute("")).toBe(0);
});

test('execute(" ") => 0', () => {
  expect(execute(" ")).toBe(0);
});
