import { expect, test } from "bun:test";
import { interpretModules } from "../modules";

test('interpretModules(["main"], { main: "let { x } = lib; x", lib: "out let x = 1;" }) => 1', () => {
  expect(
    interpretModules(
      ["main"],
      new Map([
        ["main", "let { x } = lib; x"],
        ["lib", "out let x = 1;"],
      ]),
    ),
  ).toEqual({ ok: true, value: 1 });
});

test("destructuring a name a module does not export is an error", () => {
  expect(
    interpretModules(
      ["main"],
      new Map([
        ["main", "let { y } = lib; y"],
        ["lib", "out let x = 1;"],
      ]),
    ).ok,
  ).toBe(false);
});

test("a module name used as a value with no such module is an error", () => {
  expect(interpretModules(["main"], new Map([["main", "nope"]])).ok).toBe(false);
});
