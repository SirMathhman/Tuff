import { interpret } from "../src/interpret";

function expectOkValue(expr: string, expected: number) {
  const r = interpret(expr);
  expect(r.ok).toBe(true);
  if (r.ok) expect(r.value).toBe(expected);
}

function expectErrorContains(expr: string, substr: RegExp) {
  const r = interpret(expr);
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error.toLowerCase()).toMatch(substr);
}

describe("interpret - arithmetic", () => {
  test("parses integer string to number", () => {
    const r = interpret("100");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(100);
  });

  test("evaluates simple addition expression", () => {
    const r = interpret("1 + 2");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(3);
  });

  test("evaluates chain addition expression", () => {
    const r = interpret("1 + 2 + 3");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(6);
  });

  test("evaluates mixed addition and subtraction", () => {
    const r = interpret("10 - 5 + 3");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(8);
  });

  test("evaluates operator precedence (addition and multiplication)", () => {
    const r = interpret("10 + 5 * 3");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(25);
  });

  test("evaluates parentheses and multiplication", () => {
    const r = interpret("(10 + 5) * 3");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(45);
  });

  test("evaluates multiplication and parentheses", () => {
    const r = interpret("2*(3+4)/2");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(7);
  });

  test("handles decimals and unary minus", () => {
    const r1 = interpret("3.5 + 1.5");
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(r1.value).toBe(5);

    const r2 = interpret("-1 + 2");
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.value).toBe(1);
  });
});

describe("interpret - booleans & conditionals", () => {
  test("parses boolean true to 1", () => {
    expectOkValue("true", 1);
  });

  test("parses boolean false to 0", () => {
    expectOkValue("false", 0);
  });

  test("evaluates inline if expression", () => {
    expectOkValue("if (true) 10 / 2 else 3", 5);
  });

  test("inline if returning booleans", () => {
    expectOkValue("if (true) true else false", 1);
  });

  test("logical OR with if-expression", () => {
    expectOkValue("(if (false) false else true) || true", 1);
  });

  test("division by zero returns error", () => {
    expectErrorContains("10 / (5 - 5)", /division/);
  });
});
