import { expect, test } from "bun:test";
import { interpretModules } from "../modules";

test('interpretModules(["main"], { main: "1" }) => 1', () => {
  expect(interpretModules(["main"], new Map([["main", "1"]]))).toEqual({ ok: true, value: 1 });
});

test('interpretModules(["parent", "main"]) runs the module keyed "parent/main"', () => {
  expect(interpretModules(["parent", "main"], new Map([["parent/main", "1"]]))).toEqual({ ok: true, value: 1 });
});

test("interpretModules with an unknown module is an error", () => {
  expect(interpretModules(["missing"], new Map()).ok).toBe(false);
});

test("interpretModules with no entries is an error", () => {
  expect(interpretModules([], new Map()).ok).toBe(false);
});

test("interpretModules error names the module that failed", () => {
  const result = interpretModules(["main"], new Map([["main", "true +"]]));
  expect(result.ok).toBe(false);
  if (result.ok) return;
  const { error } = result;
  expect(error.startsWith('In module "main": ')).toBe(true);
});
