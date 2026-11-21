import { expect, test } from "bun:test";
import { interpretTuff } from "../../index";
import { interpretModules } from "../../modules";

test('interpretTuff("namespace Foo { out let x = 100; } Foo::x") => 100', () => {
  expect(interpretTuff("\n\nnamespace Foo {\n  out let x = 100;\n}\n\nFoo::x\n\n")).toEqual({
    ok: true,
    value: 100,
  });
});

test('interpretTuff("let foo = 1; namespace foo { out let x = 2; } foo::x") is an error', () => {
  expect(interpretTuff("let foo = 1; namespace foo { out let x = 2; } foo::x").ok).toBe(false);
});

test('interpretTuff("namespace N { if (true) { out let x = 1; } } N::x") is an error', () => {
  expect(interpretTuff("namespace N { if (true) { out let x = 1; } } N::x").ok).toBe(false);
});

test('interpretTuff("namespace N { out let x = 1; } let y = N::x; y") => 1', () => {
  expect(interpretTuff("namespace N { out let x = 1; } let y = N::x; y")).toEqual({ ok: true, value: 1 });
});

test('interpretTuff("namespace N { out let x = 1; } fn f() : I32 => { N::x + 1 } f()") => 2', () => {
  expect(interpretTuff("namespace N { out let x = 1; } fn f() : I32 => { N::x + 1 } f()")).toEqual({
    ok: true,
    value: 2,
  });
});

test('interpretTuff("namespace foo { out let lib = 3; } foo::lib") => 3', () => {
  expect(interpretTuff("namespace foo { out let lib = 3; } foo::lib")).toEqual({ ok: true, value: 3 });
});

test('a module path "foo::lib" is a namespace error when namespace foo is in scope', () => {
  const result = interpretModules(
    ["main"],
    new Map([
      ["main", "namespace foo { out let x = 1; } foo::lib"],
      ["foo/lib", "out let value = 1;"],
    ]),
  );
  expect(result.ok).toBe(false);
});

test('interpretTuff("if (false) { namespace N { out let x = 1; } } N::x") is an error', () => {
  expect(interpretTuff("if (false) { namespace N { out let x = 1; } } N::x").ok).toBe(false);
});
