import { describe, expect, it } from "vitest";

describe("tools/tuff_lint_timeout argument parsing", () => {
  it("parses --timeout-ms <n> and strips it from forwarded args", async () => {
    const mod = await import("../../../tools/tuff_lint_timeout");

    expect(typeof mod.parseLintTimeoutArgs).toBe("function");

    const out = mod.parseLintTimeoutArgs([
      "--timeout-ms",
      "1234",
      "--debug=clone",
      "--format",
      "json",
    ]);

    expect(out.timeoutMs).toBe(1234);
    expect(out.forwardedArgs).toEqual(["--debug=clone", "--format", "json"]);
  });

  it("parses --timeout-ms=<n>", async () => {
    const mod = await import("../../../tools/tuff_lint_timeout");
    const out = mod.parseLintTimeoutArgs(["--timeout-ms=5000"]);
    expect(out.timeoutMs).toBe(5000);
    expect(out.forwardedArgs).toEqual([]);
  });
});
