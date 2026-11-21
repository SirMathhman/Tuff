import { expect, test } from "bun:test";
import { interpretModules } from "../../modules";
import { type HostValue } from "../../src/types";

test("a module exports a declare let value, and another module destructures it", () => {
  const native = new Map<string, ReadonlyMap<string, HostValue>>([
    ["native", new Map<string, HostValue>([["value", 2]])],
  ]);
  expect(
    interpretModules(
      ["main"],
      new Map([
        ["main", "let { value } = lib; value"],
        ["lib", "extern let { value } = extern native; declare out let value : I32;"],
      ]),
      native,
    ),
  ).toEqual({ ok: true, value: 2 });
});
