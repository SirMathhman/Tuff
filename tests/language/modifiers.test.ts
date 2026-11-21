import { expect, test } from "bun:test";
import { interpretModules } from "../../modules";
import { type HostValue } from "../../src/types";

const native = new Map<string, ReadonlyMap<string, HostValue>>([
  ["native", new Map<string, HostValue>([["value", 2]])],
]);

/**
 * Runs main, which reads lib's exported value through a destructuring.
 *
 * @param lib - The lib module's source.
 * @returns The interpretation result.
 */
function readLib(lib: string) {
  return interpretModules(
    ["main"],
    new Map([
      ["main", "let { value } = lib { value : 100 }; value"],
      ["lib", lib],
    ]),
  );
}

test('"out in let" exports an input, the same as "in out let"', () => {
  expect(readLib("out in let value : I32;")).toEqual({ ok: true, value: 100 });
});

test('"out declare let" exports a declared value, the same as "declare out let"', () => {
  expect(
    interpretModules(
      ["main"],
      new Map([
        ["main", "let { value } = lib; value"],
        ["lib", "extern let { value } = extern native; out declare let value : I32;"],
      ]),
      native,
    ),
  ).toEqual({ ok: true, value: 2 });
});

test('"in declare let" cannot be combined', () => {
  expect(readLib("in declare let value : I32;").ok).toBe(false);
});

test("a modifier that repeats is an error", () => {
  expect(readLib("out out let value : I32;").ok).toBe(false);
});
