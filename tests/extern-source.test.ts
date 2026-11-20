import { expect, test } from "bun:test";
import { interpretModules } from "../modules";
import { type HostValue } from "../src/types";

const native = new Map<string, ReadonlyMap<string, HostValue>>([["lib", new Map<string, HostValue>([["x", 2]])]]);

test("extern lib reads the native module, not the Tuff module of the same name", () => {
  expect(
    interpretModules(
      ["main"],
      new Map([
        ["main", "let { extern x } = extern lib; extern let x : I32; x"],
        ["lib", "out let x = 1;"],
      ]),
      native,
    ),
  ).toEqual({ ok: true, value: 2 });
});

test("a plain module name does not read a native module", () => {
  expect(interpretModules(["main"], new Map([["main", "lib.x"]]), native).ok).toBe(false);
});
