import { describe, expect, it } from "vitest";

// NOTE: this test is intentionally tiny; it only verifies argument forwarding
// logic for `npm run lint` without actually running the linter.

describe("tools/tuff_lint argument forwarding", () => {
  it("appends the compiler root after extra args", async () => {
    const mod = await import("../../../tools/tuff_lint");

    expect(typeof mod.makeFluffArgv).toBe("function");

    const argv = mod.makeFluffArgv(
      "C:/repo/src/main/tuff/compiler/tuffc.tuff",
      ["--debug", "--format", "json"]
    );

    expect(argv).toEqual([
      "--debug",
      "--format",
      "json",
      "C:/repo/src/main/tuff/compiler/tuffc.tuff",
    ]);
  });
});
