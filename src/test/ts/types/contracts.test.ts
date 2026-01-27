import { describe } from "bun:test";
import { itBoth } from "../test-helpers";

describe("contracts", () => {
  itBoth("supports empty contract declaration", (assertValid) => {
    assertValid("contract Empty {}", 0);
  });

  itBoth(
    "supports contract declaration with name and empty body",
    (assertValid) => {
      assertValid("contract MyContract {}", 0);
    },
  );
});
