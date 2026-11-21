import { expect, test } from "bun:test";
import { interpretModules } from "../modules";
import { type HostValue } from "../src/types";

const lib = new Map<string, HostValue>([["x", 1]]);

test('interpretModules(["main"], { main: "let { extern x } = extern lib; declare let x : I32; x" }, { lib: { x: 1 } }) => 1', () => {
  expect(
    interpretModules(
      ["main"],
      new Map([["main", "let { extern x } = extern lib; declare let x : I32; x"]]),
      new Map([["lib", lib]]),
    ),
  ).toEqual({ ok: true, value: 1 });
});

test("two extern lets of the same name in one scope is an error", () => {
  expect(
    interpretModules(
      ["main"],
      new Map([["main", "let { extern x } = extern lib; declare let x : I32; declare let x : I32; x"]]),
      new Map([["lib", lib]]),
    ).ok,
  ).toBe(false);
});

test("destructuring a field the native module does not have is an error", () => {
  expect(
    interpretModules(["main"], new Map([["main", "let { extern y } = extern lib; y"]]), new Map([["lib", lib]])).ok,
  ).toBe(false);
});

test("declare let with no earlier binding and no host value is an error", () => {
  expect(interpretModules(["main"], new Map([["main", "declare let x : I32; x"]])).ok).toBe(false);
});
