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

test("an object's out fn read without a call is an error that says it must be called", () => {
  const result = interpretTuff("object O { out fn f() : Void => { } } O.f");
  expect(result.ok).toBe(false);
  expect(result.ok ? "" : result.error).toContain("called");
});

test("a read of an object's out let is a snapshot taken when it is read", () => {
  expect(
    interpretTuff("object O { out let mut x = 0; out fn f() : Void => { x += 1; } } let y = O.x; O.f(); y"),
  ).toEqual({ ok: true, value: 0 });
});

test("an out fn that assigns a field not declared with let mut is an error", () => {
  const result = interpretTuff("object O { out let x = 1; out fn f() : Void => { x += 1; } } O.f();");
  expect(result.ok).toBe(false);
  expect(result.ok ? "" : result.error).toContain("let mut");
});

test("an object cannot share a name with an earlier variable in its scope", () => {
  expect(interpretTuff("let O = 1; object O { out let x = 2; } O.x").ok).toBe(false);
});

test("an object and a struct may share a name, and an object is not passed as that struct", () => {
  expect(interpretTuff("struct O { x : I32 } object O { out let x = 1; } O.x")).toEqual({ ok: true, value: 1 });
  expect(interpretTuff("struct O { x : I32 } fn g(p : O) : I32 => p.x; object O { out let x = 1; } g(O)").ok).toBe(
    false,
  );
});

test('interpretTuff("object Singleton {\\n}\\n\\n&Singleton == &Singleton") => 1', () => {
  expect(interpretTuff("object Singleton {\n}\n\n&Singleton == &Singleton")).toEqual({ ok: true, value: 1 });
});
