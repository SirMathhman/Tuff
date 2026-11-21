import { expect, test } from "bun:test";
import { interpretTuff } from "../../index";

test('interpretTuff("fn Wrapper() => { let x = 1; this } Wrapper().x") => 1', () => {
  expect(interpretTuff("\n\nfn Wrapper() => {\n  let x = 1;\n  this\n}\n\nWrapper().x\n\n")).toEqual({
    ok: true,
    value: 1,
  });
});

test("bare this inside an object body does not expose private names", () => {
  expect(interpretTuff("object O { let p = 1; out let x = 2; out let t = this; } O.t.p").ok).toBe(false);
});

test("a function may name its own return type, and bare this has that struct type", () => {
  expect(interpretTuff("fn Wrapper() : Wrapper => {\n  let x = 1;\n  this\n}\n\nWrapper().x")).toEqual({
    ok: true,
    value: 1,
  });
});

test("a function may not take the name of a type alias in its scope", () => {
  expect(interpretTuff("type Foo = I32; fn Foo() : Foo => 5; Foo()").ok).toBe(false);
});

test("inside a function, Name.this is a snapshot of that call's variables", () => {
  expect(interpretTuff("fn Wrapper() : Wrapper => {\n  let x = 1;\n  Wrapper.this\n}\n\nWrapper().x")).toEqual({
    ok: true,
    value: 1,
  });
});
