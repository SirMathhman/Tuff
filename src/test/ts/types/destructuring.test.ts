import { describe } from "bun:test";
import { itBoth } from "../test-helpers";

describe("struct destructuring", () => {
  itBoth("supports struct field destructuring", (ok) => {
    ok(
      "struct Point { x : I32, y : I32 } let { x, y } = Point { x : 3, y : 4 }; x + y",
      7,
    );
  });
});
