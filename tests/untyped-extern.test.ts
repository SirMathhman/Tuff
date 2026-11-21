import { expect, test } from "bun:test";
import { interpretModules } from "../modules";
import { type HostValue } from "../src/types";

const native = new Map<string, ReadonlyMap<string, HostValue>>([["lib", new Map<string, HostValue>([["x", 2]])]]);

test('interpretModules(["main"], { main: "let { extern x } = extern lib; x" }, native lib) is an error: extern x needs a type', () => {
  expect(interpretModules(["main"], new Map([["main", "let { extern x } = extern lib; x"]]), native).ok).toBe(false);
});

test("two typed externs of the same name in one scope is still an error", () => {
  expect(
    interpretModules(
      ["main"],
      new Map([["main", "let { extern x } = extern lib; declare let x : I32; declare let x : I32; x"]]),
      native,
    ).ok,
  ).toBe(false);
});
