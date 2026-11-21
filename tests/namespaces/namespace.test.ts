import { expect, test } from "bun:test";
import { interpretTuff } from "../../index";

test('interpretTuff("namespace Foo { out let x = 100; } Foo::x") => 100', () => {
  expect(interpretTuff("\n\nnamespace Foo {\n  out let x = 100;\n}\n\nFoo::x\n\n")).toEqual({
    ok: true,
    value: 100,
  });
});
