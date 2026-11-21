import { expect, test } from "bun:test";
import { interpretTuff } from "../../index";

test('interpretTuff("object Singleton { out let x = 1; } Singleton.x") => 1', () => {
  expect(interpretTuff("\n\nobject Singleton {\n  out let x = 1;\n}\n\nSingleton.x\n\n")).toEqual({
    ok: true,
    value: 1,
  });
});
