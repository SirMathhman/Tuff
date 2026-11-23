import { expect, test } from "bun:test";
import { interpretTuff } from "./index.ts";

test("interpretTuff('1') returns 1", () => {
  expect(interpretTuff("1")).toBe(1);
});

test("interpretTuff('1 + 2') returns 3", () => {
  expect(interpretTuff("1 + 2")).toBe(3);
});
