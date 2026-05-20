import { describe, test, expect } from "@jest/globals";
import { run } from "../src";

describe("Jest setup", () => {
  test("should pass a basic test", () => {
    expect(1 + 1).toBe(2);
  });

  test("should handle string equality", () => {
    expect("hello").toEqual("hello");
  });

  test('run with empty input should return 0', () => {
    expect(run("", "")).toBe(0);
  });
});
