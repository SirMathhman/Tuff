import { interpret } from "../src/interpret";

describe("interpret - parsing & ranges", () => {
  it("parses integer string to number", () => {
    expect(interpret("100")).toBe(100);
  });

  it("parses integer with trailing text (e.g., '100U8') to number", () => {
    expect(interpret("100U8")).toBe(100);
  });

  it("throws when unsigned type value is out of range (e.g., '256U8')", () => {
    expect(() => interpret("256U8")).toThrow(Error);
  });

  it("supports U8 ranges", () => {
    expect(interpret("0U8")).toBe(0);
    expect(interpret("255U8")).toBe(255);
    expect(() => interpret("256U8")).toThrow(Error);
  });

  it("supports I8 ranges", () => {
    expect(interpret("127I8")).toBe(127);
    expect(interpret("-128I8")).toBe(-128);
    expect(() => interpret("128I8")).toThrow(Error);
    expect(() => interpret("-129I8")).toThrow(Error);
  });

  it("supports U32 and I32 ranges", () => {
    expect(interpret("4294967295U32")).toBe(4294967295);
    expect(() => interpret("4294967296U32")).toThrow(Error);
    expect(interpret("2147483647I32")).toBe(2147483647);
    expect(() => interpret("2147483648I32")).toThrow(Error);
  });

  it("supports U64/I64 within JS safe integer and rejects unsafe values", () => {
    // max safe integer
    expect(interpret("9007199254740991U64")).toBe(9007199254740991);
    expect(() => interpret("9007199254740992U64")).toThrow(Error);
    expect(interpret("9007199254740991I64")).toBe(9007199254740991);
    // a large I64 exceeding JS safe integer should be rejected
    expect(() => interpret("9223372036854775807I64")).toThrow(Error);
  });

  it("throws when negative number has trailing text (e.g., '-1U8')", () => {
    expect(() => interpret("-1U8")).toThrow(Error);
  });
});

describe("interpret - arithmetic", () => {
  it("adds two typed integers", () => {
    expect(interpret("1U8 + 2U8")).toBe(3);
  });

  it("adds multiple typed integers", () => {
    expect(interpret("1U8 + 2U8 + 3U8")).toBe(6);
  });

  it("throws when mixed widths are added", () => {
    expect(() => interpret("1U8 + 2U16 + 3U8")).toThrow(Error);
  });

  it("handles mixed + and - operations", () => {
    expect(interpret("10U8 - 5U8 + 3U8")).toBe(8);
  });

  it("throws when unsigned subtraction underflows", () => {
    expect(() => interpret("1U8 - 2U8")).toThrow(Error);
  });

  it("multiplies with precedence over addition", () => {
    expect(interpret("10 * 5 + 3")).toBe(53);
  });

  it("respects precedence: addition after multiplication", () => {
    expect(interpret("3 + 10 * 5")).toBe(53);
  });

  it("supports parentheses for grouping", () => {
    expect(interpret("(3 + 1) * 2")).toBe(8);
  });

  it("supports brace grouping as parentheses", () => {
    expect(interpret("(3 + { 1 }) * 2")).toBe(8);
  });

  it("supports blocks with declarations and returns last expression", () => {
    expect(interpret("(3 + { let x : I32 = 1; x }) * 2")).toBe(8);
  });

  it("throws on division by zero", () => {
    expect(() => interpret("10 / 0")).toThrow(Error);
  });

  it("throws on division by zero with parenthesized denominator", () => {
    expect(() => interpret("10 / (2 - 2)")).toThrow(Error);
  });
});
