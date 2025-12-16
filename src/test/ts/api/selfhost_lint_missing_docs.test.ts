import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { lintCode, setFluffMissingDocsOptions } from "../compiler_api_wrapper";

describe("selfhost analyzer linting: missing documentation", () => {
  beforeEach(async () => {
    // Enable missing docs as warnings for these tests.
    await setFluffMissingDocsOptions(1);
  });

  afterEach(async () => {
    // Reset to defaults to avoid cross-test contamination.
    await setFluffMissingDocsOptions(0);
  });

  test("warns on exported function without doc comment", async () => {
    const entryCode = [
      "out fn helper(x: I32) : I32 => x + 1",
      "",
      "fn main() : I32 => helper(1)",
      "",
    ].join("\n");

    const r = await lintCode(entryCode, {});
    expect(r.success).toBe(true);
    const warnText = (r.warnings ?? []).map((w) => w.msg).join("\n");
    expect(warnText).toMatch(/missing\s+doc/i);
    expect(warnText).toMatch(/\bhelper\b/);
  });

  test("does not warn on exported function with doc comment", async () => {
    const entryCode = [
      "// Adds one to the input.",
      "out fn helper(x: I32) : I32 => x + 1",
      "",
      "fn main() : I32 => helper(1)",
      "",
    ].join("\n");

    const r = await lintCode(entryCode, {});
    expect(r.success).toBe(true);
    const warnText = (r.warnings ?? []).map((w) => w.msg).join("\n");
    expect(warnText).not.toMatch(/missing\s+doc/i);
  });

  test("does not warn on private (non-exported) function without doc", async () => {
    const entryCode = [
      "fn private_helper(x: I32) : I32 => x + 1",
      "",
      "fn main() : I32 => private_helper(1)",
      "",
    ].join("\n");

    const r = await lintCode(entryCode, {});
    expect(r.success).toBe(true);
    const warnText = (r.warnings ?? []).map((w) => w.msg).join("\n");
    expect(warnText).not.toMatch(/missing\s+doc/i);
  });

  test("does not warn on main function", async () => {
    const entryCode = ["fn main() : I32 => 0", ""].join("\n");

    const r = await lintCode(entryCode, {});
    expect(r.success).toBe(true);
    const warnText = (r.warnings ?? []).map((w) => w.msg).join("\n");
    expect(warnText).not.toMatch(/missing\s+doc/i);
  });

  test("accepts block comment as documentation", async () => {
    const entryCode = [
      "/* Returns the input plus one. */",
      "out fn helper(x: I32) : I32 => x + 1",
      "",
      "fn main() : I32 => helper(1)",
      "",
    ].join("\n");

    const r = await lintCode(entryCode, {});
    expect(r.success).toBe(true);
    const warnText = (r.warnings ?? []).map((w) => w.msg).join("\n");
    expect(warnText).not.toMatch(/missing\s+doc/i);
  });

  // TODO: Structs don't have isOut visibility in the AST yet.
  // Re-enable these tests when struct visibility is added.
  test.skip("warns on exported struct without doc comment", async () => {
    const entryCode = [
      "out struct Point { x: I32, y: I32 }",
      "",
      "fn main() : I32 => 0",
      "",
    ].join("\n");

    const r = await lintCode(entryCode, {});
    expect(r.success).toBe(true);
    const warnText = (r.warnings ?? []).map((w) => w.msg).join("\n");
    expect(warnText).toMatch(/missing\s+doc/i);
    expect(warnText).toMatch(/\bPoint\b/);
  });

  test.skip("does not warn on exported struct with doc comment", async () => {
    const entryCode = [
      "// A 2D point.",
      "out struct Point { x: I32, y: I32 }",
      "",
      "fn main() : I32 => 0",
      "",
    ].join("\n");

    const r = await lintCode(entryCode, {});
    expect(r.success).toBe(true);
    const warnText = (r.warnings ?? []).map((w) => w.msg).join("\n");
    expect(warnText).not.toMatch(/missing\s+doc/i);
  });

  test("whitespace between comment and declaration is allowed", async () => {
    const entryCode = [
      "// Adds one to the input.",
      "",
      "out fn helper(x: I32) : I32 => x + 1",
      "",
      "fn main() : I32 => helper(1)",
      "",
    ].join("\n");

    const r = await lintCode(entryCode, {});
    expect(r.success).toBe(true);
    const warnText = (r.warnings ?? []).map((w) => w.msg).join("\n");
    expect(warnText).not.toMatch(/missing\s+doc/i);
  });
});
