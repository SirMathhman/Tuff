import { describe, expect, test } from "vitest";

import { lintCode } from "../compiler_api_wrapper";

describe("selfhost analyzer linting", () => {
  test("rejects missing parameter type annotations (functions + lambdas)", async () => {
    const entryCode = [
      // Missing types in a named function
      "fn f(a, b: I32, c) : I32 => b",
      "",
      // Missing types in a lambda
      "out fn run() : I32 => {",
      "  let g = (x, y: I32, z) : I32 => y;",
      "  g(1, 2, 3)",
      "}",
      "",
    ].join("\n");

    const r = await lintCode(entryCode, {});
    expect(r.success).toBe(false);
    const msg = (r.errors ?? []).map((e) => e.msg).join("\n");

    // Must mention missing type annotations, and list all missing params.
    expect(msg).toMatch(/missing type annotation/i);
    expect(msg).toMatch(/\bf\b/i);
    expect(msg).toMatch(/\ba\b/i);
    expect(msg).toMatch(/\bc\b/i);
    expect(msg).toMatch(/lambda/i);
    expect(msg).toMatch(/\bx\b/i);
    expect(msg).toMatch(/\bz\b/i);
  });
});
