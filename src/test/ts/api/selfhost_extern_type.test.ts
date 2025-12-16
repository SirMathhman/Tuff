import { describe, expect, test } from "vitest";

import { compileCode } from "../compiler_api_wrapper";

describe("selfhost extern type", () => {
  test("selfhost tuffc accepts `extern type` declarations", async () => {
    const entryCode = [
      "extern type Foo<T>",
      "",
      "fn idFoo(x: Foo<I32>) : I32 => 0",
      "",
      "fn main() : I32 => 0",
      "",
    ].join("\n");

    const result = await compileCode(entryCode, {});
    expect(result.diagnostics ?? "").toBe("");
    expect(result.success).toBe(true);
    expect(result.entryJs ?? "").toContain("export function main");
  });
});
