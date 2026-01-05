import { interpret } from "../src/interpret";

describe("interpret", () => {
  it("returns numeric literal", () => {
    const result = interpret("1");
    expect(result).toEqual({ ok: true, value: 1 });
  });
});
