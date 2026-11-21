import { expect, test } from "bun:test";
import { interpretModules } from "../../modules";

test('interpretModules(["main"]) with main "let { value } = foo::lib; value" and "foo/lib" => 1', () => {
  expect(
    interpretModules(
      ["main"],
      new Map([
        ["main", "let { value } = foo::lib; value"],
        ["foo/lib", "out let value = 1;"],
      ]),
    ),
  ).toEqual({ ok: true, value: 1 });
});

test("a path segment followed by a member reads that module's export", () => {
  expect(
    interpretModules(
      ["main"],
      new Map([
        ["main", "foo::lib.value"],
        ["foo/lib", "out let value = 2;"],
      ]),
    ),
  ).toEqual({ ok: true, value: 2 });
});
