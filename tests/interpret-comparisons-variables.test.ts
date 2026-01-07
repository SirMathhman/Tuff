import { describe, it } from "vitest";
import { interpret } from "../src/interpret";
import { expectOkValue } from "../src/utils/testUtils";

describe("interpret - comparisons with variables", () => {
  it("compares variable values", () => {
    expectOkValue(interpret("let x : I32 = 5; x > 3"), 1);
  });

  it("compares two variables", () => {
    expectOkValue(interpret("let x : I32 = 5; let y : I32 = 3; x < y"), 0);
  });

  it("uses comparison in conditional", () => {
    expectOkValue(interpret("let x : I32 = 10; if (x > 5) 100 else 50"), 100);
  });

  it("stores comparison result in variable", () => {
    expectOkValue(
      interpret("let x : I32 = 5; let result : I32 = x > 3; result"),
      1
    );
  });

  it("uses block result in comparison through variable binding", () => {
    expectOkValue(interpret("let x : I32 = { 5 }; x > 3"), 1);
  });
});
