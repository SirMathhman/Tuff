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

test('execute("let x = 0; let x = 1; x") => 1', () => {
  expect(execute("let x = 0; let x = 1; x")).toBe(1);
});

test('execute("let x = true; x") => 1', () => {
  expect(execute("let x = true; x")).toBe(1);
});

test('execute("let x = false; x") => 0', () => {
  expect(execute("let x = false; x")).toBe(0);
});

test('execute("let x = true; let y = false; x || y") => 1', () => {
  expect(execute("let x = true; let y = false; x || y")).toBe(1);
});

test('execute("let x = true; let y = false; x && y") => 0', () => {
  expect(execute("let x = true; let y = false; x && y")).toBe(0);
});

test('execute("let x = 0; let y = 1; x < y") => 1', () => {
  expect(execute("let x = 0; let y = 1; x < y")).toBe(1);
});

test('execute("let x = 0; let y = 1; x > y") => 0', () => {
  expect(execute("let x = 0; let y = 1; x > y")).toBe(0);
});

test('execute("let x = 1; let y = 1; x <= y") => 1', () => {
  expect(execute("let x = 1; let y = 1; x <= y")).toBe(1);
});

test('execute("let x = 2; let y = 1; x >= y") => 1', () => {
  expect(execute("let x = 2; let y = 1; x >= y")).toBe(1);
});

test('execute("let x = 1; let y = 1; x == y") => 1', () => {
  expect(execute("let x = 1; let y = 1; x == y")).toBe(1);
});

test('execute("let x = 1; let y = 2; x != y") => 1', () => {
  expect(execute("let x = 1; let y = 2; x != y")).toBe(1);
});

test('execute("let x = if (true) 3 else 5; x") => 3', () => {
  expect(execute("let x = if (true) 3 else 5; x")).toBe(3);
});

test('execute("let x = if (false) 1 else if (false) 2 else 3; x") => 3', () => {
  expect(execute("let x = if (false) 1 else if (false) 2 else 3; x")).toBe(3);
});

test('execute("let mut x = 0; if (true) x = 3 else x = 5; x") => 3', () => {
  expect(execute("let mut x = 0; if (true) x = 3 else x = 5; x")).toBe(3);
});

test('execute("let mut x = 0; if (false) x = 1 else x = 2; x") => 2', () => {
  expect(execute("let mut x = 0; if (false) x = 1 else x = 2; x")).toBe(2);
});

test('execute("let mut x = 0; x = 1; x") => 1', () => {
  expect(execute("let mut x = 0; x = 1; x")).toBe(1);
});

test('execute("let x = 0; x = 1; x") should throw error', () => {
  expect(() => execute("let x = 0; x = 1; x")).toThrow();
});

test('execute("let mut x = 0; { x = 1; } x") => 1', () => {
  expect(execute("let mut x = 0; { x = 1; } x")).toBe(1);
});

test('execute("let x = 0; { let x = 1; } x") => 0', () => {
  expect(execute("let x = 0; { let x = 1; } x")).toBe(0);
});

test('execute("z = 5") should throw error (undefined variable)', () => {
  expect(() => execute("z = 5")).toThrow();
});

test('execute("abc") throws error', () => {
  expect(() => execute("abc")).toThrow();
});

test('execute("{ let mut x = 0; if (true) x = 3 else x = 5; x }") => 3', () => {
  expect(execute("{ let mut x = 0; if (true) x = 3 else x = 5; x }")).toBe(3);
});

test('execute("let mut x = 0; if (false) x = 3; else x = 5; x") => 5', () => {
  expect(execute("let mut x = 0; if (false) x = 3; else x = 5; x")).toBe(5);
});

test('execute("let mut x = 0; if (false) x = 3; else if (false) x = 4; else x = 5; x") => 5', () => {
  expect(
    execute(
      "let mut x = 0; if (false) x = 3; else if (false) x = 4; else x = 5; x",
    ),
  ).toBe(5);
});

test('execute("let mut x = 0; if (true) { x = 3; } x") => 3', () => {
  expect(execute("let mut x = 0; if (true) { x = 3; } x")).toBe(3);
});

test('execute("let mut x = 0; x += 1; x") => 1', () => {
  expect(execute("let mut x = 0; x += 1; x")).toBe(1);
});

test('execute("let mut x = 0; while (x < 4) x += 1; x") => 4', () => {
  expect(execute("let mut x = 0; while (x < 4) x += 1; x")).toBe(4);
});

test('execute("let mut x = 0; while (x < 4) { x += 1; } x") => 4', () => {
  expect(execute("let mut x = 0; while (x < 4) { x += 1; } x")).toBe(4);
});

test('execute("let mut sum = 0; for (i in 0..4) sum += i; sum") => 6', () => {
  expect(execute("let mut sum = 0; for (i in 0..4) sum += i; sum")).toBe(6);
});

test('execute("let mut sum = 0; for (i in 0..4) { sum += i; } sum") => 6', () => {
  expect(execute("let mut sum = 0; for (i in 0..4) { sum += i; } sum")).toBe(6);
});

test('execute("let array = [1, 2, 3]; array[0]") => 1', () => {
  expect(execute("let array = [1, 2, 3]; array[0]")).toBe(1);
});

test('execute("let temp = \\"test\\"; temp.length") => 4', () => {
  expect(execute('let temp = "test"; temp.length')).toBe(4);
});

test('execute("let temp = \\"<=\\\"; temp.length") => 2', () => {
  expect(execute('let temp = "<="; temp.length')).toBe(2);
});
test('execute("\"ab\".length") => 2', () => {
  expect(execute('"ab".length')).toBe(2);
});

test('execute(""".length") => 0', () => {
  expect(execute('"".length')).toBe(0);
});
test('execute("let temp = \"\\\"; temp.length") => 1', () => {
  expect(execute(`let temp = "\\""; temp.length`)).toBe(1);
});
test('execute("let arr = [10, 20]; arr[1]") => 20', () => {
  expect(execute("let arr = [10, 20]; arr[1]")).toBe(20);
});

test('execute("([7, 8])[0]") => 7', () => {
  expect(execute("([7, 8])[0]")).toBe(7);
});

test('execute("@") should throw error (unrecognized token)', () => {
  expect(() => execute("@")).toThrow();
});

test('execute("fn get() => 100; get()") => 100', () => {
  expect(execute("fn get() => 100; get()")).toBe(100);
});
