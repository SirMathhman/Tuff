import { expect, test } from "bun:test";
import { interpretTuff } from "./index";

test("interpretTuff('1') => 1", () => {
  expect(interpretTuff("1")).toEqual({ ok: true, value: 1 });
});
