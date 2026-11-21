import { expect, test } from "bun:test";
import { interpretTuff } from "../../index";

test('interpretTuff("object Singleton { out let x = 1; } Singleton.x") => 1', () => {
  expect(interpretTuff("\n\nobject Singleton {\n  out let x = 1;\n}\n\nSingleton.x\n\n")).toEqual({
    ok: true,
    value: 1,
  });
});

test('interpretTuff("object Singleton { out let mut x = 0; out fn increment() : Void => { x += 1; } } Singleton.increment(); Singleton.increment(); Singleton.x") => 2', () => {
  expect(
    interpretTuff(
      "object Singleton {\n  out let mut x = 0;\n\n  out fn increment() : Void => {\n    x += 1;\n  }\n}\n\nSingleton.increment();\nSingleton.increment();\nSingleton.x\n",
    ),
  ).toEqual({ ok: true, value: 2 });
});
