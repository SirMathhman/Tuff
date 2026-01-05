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
