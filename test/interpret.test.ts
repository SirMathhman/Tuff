import { interpret } from "../src/interpret";

describe("interpret", () => {
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

  test("parses boolean true to 1", () => {
    const r = interpret("true");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(1);
  });

  test("parses boolean false to 0", () => {
    const r = interpret("false");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(0);
  });

  test("evaluates inline if expression", () => {
    const r = interpret("if (true) 10 / 2 else 3");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(5);
  });

  test("inline if returning booleans", () => {
    const r = interpret("if (true) true else false");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(1);
  });

  test("division by zero returns error", () => {
    const r = interpret("10 / (5 - 5)");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.toLowerCase()).toMatch(/division/);
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
