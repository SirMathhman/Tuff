import { expect, test } from "bun:test";
import { interpretModules } from "../modules";

test('interpretModules(["main"], { main: "struct Wrapper { x : I32 } let { x } = Wrapper { x : 3 }; declare let x : I32; x" }) is an error: declare let needs an extern to type', () => {
  expect(
    interpretModules(
      ["main"],
      new Map([["main", "struct Wrapper { x : I32 } let { x } = Wrapper { x : 3 }; declare let x : I32; x"]]),
    ).ok,
  ).toBe(false);
});
