import { interpret } from "../src/interpret";

describe("interpret", () => {
  it("returns numeric literal", () => {
    const result = interpret("1");
    expect(result).toEqual({ ok: true, value: 1 });
  });

  it("evaluates simple addition", () => {
    const result = interpret("1 + 2");
    expect(result).toEqual({ ok: true, value: 3 });
  });

  it("evaluates chained additions", () => {
    const result = interpret("1 + 2 + 3");
    expect(result).toEqual({ ok: true, value: 6 });
  });

  it("evaluates additions and subtractions left-to-right", () => {
    const result = interpret("10 - 5 + 3");
    expect(result).toEqual({ ok: true, value: 8 });
  });
});
