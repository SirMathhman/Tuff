import { expect, test } from "bun:test";
import { interpretModules } from "../../modules";

test('interpretModules(["main"]) with main "let { x } = lib { x : 100 }; x" and lib "in out let x : I32;" => 100', () => {
  expect(
    interpretModules(
      ["main"],
      new Map([
        ["main", "let { x } = lib { x : 100 }; x"],
        ["lib", "in out let x : I32;"],
      ]),
    ),
  ).toEqual({ ok: true, value: 100 });
});
