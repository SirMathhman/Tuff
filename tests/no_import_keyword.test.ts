import { describe, expect, test } from "bun:test";
import { compile } from "./helpers";

describe("language: no import keyword", () => {
  test("`import` is rejected; use `from ... use { ... }`", () => {
    const { diagnostics } = compile(`
      import math
      fn main() => 0
    `);
    const errors = diagnostics.filter((d) => d.severity === "error");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.map((e) => e.message).join("\n")).toMatch(
      /import[\s\S]*from[\s\S]*use/i
    );
  });
});
