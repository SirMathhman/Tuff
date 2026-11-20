import { expect, test } from "bun:test";
import { interpretModules } from "../modules";

test('interpretModules(["main"], { main: "lib.x", lib: "out let x = 1;" }) => 1', () => {
  expect(
    interpretModules(
      ["main"],
      new Map([
        ["main", "lib.x"],
        ["lib", "out let x = 1;"],
      ]),
    ),
  ).toEqual({ ok: true, value: 1 });
});

test("imported module's exported value can be used in arithmetic", () => {
  expect(
    interpretModules(
      ["main"],
      new Map([
        ["main", "lib.x + lib.x"],
        ["lib", "out let x = 2;"],
      ]),
    ),
  ).toEqual({ ok: true, value: 4 });
});

test("reading a name that is not exported is an error", () => {
  expect(
    interpretModules(
      ["main"],
      new Map([
        ["main", "lib.y"],
        ["lib", "out let x = 1; let y = 2;"],
      ]),
    ).ok,
  ).toBe(false);
});

test("reading a name from an unknown module is an error", () => {
  expect(interpretModules(["main"], new Map([["main", "nope.x"]])).ok).toBe(false);
});

test("out outside the top level of a module is an error", () => {
  expect(interpretModules(["main"], new Map([["main", "{ out let x = 1; x }"]])).ok).toBe(false);
});

test("import cycle is an error", () => {
  expect(
    interpretModules(
      ["main"],
      new Map([
        ["main", "a.x"],
        ["a", "out let x = b.y;"],
        ["b", "out let y = a.x;"],
      ]),
    ).ok,
  ).toBe(false);
});
