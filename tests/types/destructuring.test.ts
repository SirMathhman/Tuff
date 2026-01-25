import { describe, it } from "bun:test";
import { assertInterpretValid } from "../test-helpers";

describe("struct destructuring", () => {
  it("supports struct field destructuring", () => {
    assertInterpretValid(
      "struct Point { x : I32, y : I32 } let { x, y } = Point { x  : 3, y :  4 }; x + y",
      7,
    );
  });
});
