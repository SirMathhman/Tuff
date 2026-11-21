import { expect, test } from "bun:test";
import { interpretModules } from "../../modules";

test('interpretModules(["main"]) with main "let { y } = lib { x : 100 }; y" and lib "in let x : I32; out let y = x;" => 100', () => {
  expect(
    interpretModules(
      ["main"],
      new Map([
        ["main", "let { y } = lib { x : 100 }; y"],
        ["lib", "in let x : I32; out let y = x;"],
      ]),
    ),
  ).toEqual({ ok: true, value: 100 });
});

test("a module input that is not passed is an error", () => {
  expect(
    interpretModules(
      ["main"],
      new Map([
        ["main", "let { y } = lib { }; y"],
        ["lib", "in let x : I32; out let y = x;"],
      ]),
    ).ok,
  ).toBe(false);
});

test("a module input that the module does not declare is an error", () => {
  expect(
    interpretModules(
      ["main"],
      new Map([
        ["main", "let { y } = lib { x : 1, z : 2 }; y"],
        ["lib", "in let x : I32; out let y = x;"],
      ]),
    ).ok,
  ).toBe(false);
});
