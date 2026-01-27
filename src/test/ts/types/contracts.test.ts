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

  itBoth(
    "throws on duplicate contract declaration",
    (_assertValid, assertInvalid) => {
      assertInvalid("contract Empty {} contract Empty {}");
    },
  );

  itBoth("supports contract with function signature", (assertValid) => {
    assertValid("contract Empty { fn get() : I32; }", 0);
  });
});
