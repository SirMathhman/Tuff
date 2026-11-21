import { expect, test } from "bun:test";
import { interpretModules } from "../modules";
import { type HostValue } from "../src/types";

/**
 * Runs a main program against a native lib whose flag is set to true by its invoke function.
 *
 * @param main - The main program's source.
 * @returns The result of interpreting the program.
 */
function runWithFlagLib(main: string) {
  const lib = new Map<string, HostValue>();
  lib.set("flag", false);
  lib.set("invoke", () => {
    lib.set("flag", true);
  });
  return interpretModules(["main"], new Map([["main", main]]), new Map([["lib", lib]]));
}

test("an extern function changes an extern value the program reads afterwards", () => {
  expect(
    runWithFlagLib(
      "let { extern flag, extern invoke } = extern lib; declare let flag : Bool; declare fn invoke() : Void; invoke(); flag",
    ),
  ).toEqual({ ok: true, value: 1 });
});

test("an extern function in a branch that is not taken is not called", () => {
  expect(
    runWithFlagLib(
      "let { extern flag, extern invoke } = extern lib; declare let flag : Bool; declare fn invoke() : Void; if (false) invoke(); flag",
    ),
  ).toEqual({ ok: true, value: 0 });
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

test("a type error inside a branch that is not taken is still an error", () => {
  expect(
    runWithFlagLib(
      "let { extern flag, extern invoke } = extern lib; declare let flag : Bool; declare fn invoke() : Void; if (false) { let mut x = 0; x = true; invoke(); } flag",
    ).ok,
  ).toBe(false);
});

test("declare let with a pattern makes every name extern", () => {
  expect(
    runWithFlagLib(
      "extern let { flag, invoke } = extern lib; declare let flag : Bool; declare fn invoke() : Void; if (false) { invoke(); } flag",
    ),
  ).toEqual({ ok: true, value: 0 });
});
