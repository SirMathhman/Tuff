import { expect, test } from "bun:test";
import { interpretModules } from "../modules";
import { type HostValue } from "../src/types";

const native = new Map<string, ReadonlyMap<string, HostValue>>([["lib", new Map<string, HostValue>([["x", 2]])]]);

test('interpretModules(["main"], { main: "let { x } = extern lib; extern let x : I32; x" }, native lib) is an error: fields of an extern module need extern', () => {
  expect(
    interpretModules(["main"], new Map([["main", "let { x } = extern lib; extern let x : I32; x"]]), native).ok,
  ).toBe(false);
});

test("extern on a field of a Tuff module is an error", () => {
  expect(
    interpretModules(
      ["main"],
      new Map([
        ["main", "let { extern x } = lib; x"],
        ["lib", "out let x = 1;"],
      ]),
    ).ok,
  ).toBe(false);
});
