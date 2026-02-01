import { interpret } from "../src/index";

describe("interpret", () => {
  it("should interpret a simple number", () => {
    expect(interpret("100")).toBe("100");
  });

  it("should interpret number with U8 suffix", () => {
    expect(interpret("100U8")).toBe("100");
  });
});
