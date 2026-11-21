import { expect, test } from "bun:test";
import { interpretModules } from "../../modules";

test("extern let with a single name is an error; declare let is used instead", () => {
  expect(interpretModules(["main"], new Map([["main", "extern let x : I32; x"]])).ok).toBe(false);
});
