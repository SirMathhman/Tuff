import { interpret } from "./interpreter";

describe("interpret", () => {
  test('interpret("100") should return 100', () => {
    expect(interpret("100")).toBe(100);
  });

  test('interpret("let x = 100; x") should return 100', () => {
    expect(interpret("let x = 100; x")).toBe(100);
  });
});
