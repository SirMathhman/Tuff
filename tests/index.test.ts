import { interpret } from "../src";

function expectValid(source: string, exitCode: number) {
  expect(interpret(source)).toBe(exitCode);
}

// function expectInvalid(source: string) {
//   expect(() => interpret(source)).toThrow();
// }

describe("The interpreter can interpret", () => {
  test("an empty program", () => {
    expectValid("", 0);
  });

  test("a numeric literal", () => {
    expectValid("100", 100);
  });
});
