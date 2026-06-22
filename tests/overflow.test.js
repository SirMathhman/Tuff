import compileTuffToJS from "../src/index.js";

// Helper: compile and run Tuff source, returning the result.
function executeTuff(source, stdIn = "") {
  const compiled = compileTuffToJS(source);
  return new Function("stdIn", compiled)(stdIn);
}

test('executeTuff("1U8 + 255U8") throws (overflow)', () => {
  expect(() => executeTuff("1U8 + 255U8")).toThrow();
});

test('executeTuff("0U8 - 1U8") throws (underflow)', () => {
  expect(() => executeTuff("0U8 - 1U8")).toThrow();
});

test('executeTuff("16U8 * 16U8") throws (overflow)', () => {
  expect(() => executeTuff("16U8 * 16U8")).toThrow();
});

test('executeTuff("254U8 + 1U8", "") => 255', () => {
  expect(executeTuff("254U8 + 1U8", "")).toBe(255);
});

test('executeTuff("0I8 - 1I8", "") => -1', () => {
  expect(executeTuff("0I8 - 1I8", "")).toBe(-1);
});

test('executeTuff("-127I8 + (-1)I8") throws (underflow)', () => {
  expect(() => executeTuff("-127I8 + (-1)I8")).toThrow();
});

test('executeTuff("65534U16 + 1U16", "") => 65535', () => {
  expect(executeTuff("65534U16 + 1U16", "")).toBe(65535);
});

test('executeTuff("200U8 * 2U8") throws (overflow)', () => {
  expect(() => executeTuff("200U8 * 2U8")).toThrow();
});

test('executeTuff("126I8 + 1I8", "") => 127', () => {
  expect(executeTuff("126I8 + 1I8", "")).toBe(127);
});

test('executeTuff("10U8 + 5U16", "") => 15 (mixed type)', () => {
  expect(executeTuff("10U8 + 5U16", "")).toBe(15);
});
