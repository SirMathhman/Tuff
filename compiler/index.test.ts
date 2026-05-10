import { executeTuff } from "./index";
import { test, expect } from "bun:test";

test("executeTuff with empty string returns 0", () => {
  expect(executeTuff("")).toBe(0);
});

