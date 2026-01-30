import { interpret, compile } from "../src/index";

test("interpret numeric literal", () => {
  expect(interpret("100")).toBe(100);
});

test("interpret returns number for numeric return", () => {
  // compile is identity for now; provide JS directly that returns a number
  expect(interpret("return 42;")).toBe(42);
});

test("interpret returns NaN for non-numeric output", () => {
  expect(Number.isNaN(interpret("return 'not-a-number';"))).toBe(true);
});

test("compile throws error for U8 underflow", () => {
  expect(() => compile("-100U8")).toThrow(
    "Underflow: -100 is below minimum for U8 (0)",
  );
});

test("compile throws error for I8 underflow", () => {
  expect(() => compile("-129I8")).toThrow(
    "Underflow: -129 is below minimum for I8 (-128)",
  );
});

test("compile allows valid U8 value", () => {
  expect(compile("255U8")).toBe("return 255;");
});

test("compile allows valid I8 value", () => {
  expect(compile("-128I8")).toBe("return -128;");
});
