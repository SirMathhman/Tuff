import { expect, test } from "bun:test";
import { interpretModuleSets } from "../../modules";

test('interpretModuleSets("core", ["main"]) with lib in another set => 100', () => {
  expect(
    interpretModuleSets(
      "core",
      ["main"],
      new Map([
        ["core", new Map([["main", "let { x } = lib { x : 100 }; x"]])],
        ["other", new Map([["lib", "out in let x : I32;"]])],
      ]),
    ),
  ).toEqual({ ok: true, value: 100 });
});

test("an unknown set name is an error", () => {
  expect(interpretModuleSets("other", ["main"], new Map([["core", new Map([["main", "1"]])]])).ok).toBe(false);
});

test("a module name that appears in two sets is an error", () => {
  expect(
    interpretModuleSets(
      "a",
      ["main"],
      new Map([
        ["a", new Map([["main", "1"]])],
        ["b", new Map([["main", "2"]])],
      ]),
    ).ok,
  ).toBe(false);
});
