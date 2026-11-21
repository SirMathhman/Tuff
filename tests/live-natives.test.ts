import { expect, test } from "bun:test";
import { interpretModules } from "../modules";
import { type HostValue } from "../src/types";

test("an extern function changes an extern value the program reads afterwards", () => {
  const lib = new Map<string, HostValue>();
  lib.set("flag", false);
  lib.set("invoke", () => {
    lib.set("flag", true);
  });
  expect(
    interpretModules(
      ["main"],
      new Map([
        [
          "main",
          "let { extern flag, extern invoke } = extern lib; extern let flag : Bool; extern fn invoke() : Void; invoke(); flag",
        ],
      ]),
      new Map([["lib", lib]]),
    ),
  ).toEqual({ ok: true, value: 1 });
});

test("reading an extern function as a value is an error", () => {
  const lib = new Map<string, HostValue>([["invoke", () => {}]]);
  expect(
    interpretModules(
      ["main"],
      new Map([["main", "let { extern invoke } = extern lib; invoke"]]),
      new Map([["lib", lib]]),
    ).ok,
  ).toBe(false);
});
