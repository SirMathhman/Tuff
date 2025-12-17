import { describe, expect, test } from "vitest";

import { compileCode, importEsmFromSource } from "../compiler_api_wrapper";

describe("selfhost types", () => {
  test("selfhost tuffc accepts type annotations and generics", async () => {
    const entryCode = [
      "type Option<T> = Some<T> | None;",
      "",
      "struct Point {",
      "  x: I32,",
      "  y: I32",
      "}",
      "",
      "fn add(a: I32, b: I32) : I32 => a + b",
      "fn id<T>(x: T) : T => x",
      "",
      "out fn run() : I32 => {",
      "  let p: Point = Point { 1, 2 };",
      "  let n: I32 = add(p.x, p.y);",
      "  let o: Option<I32> = Some(n);",
      '  (if (o.tag == "Some") { id<I32>(o.value) } else { 0 })',
      "}",
      "",
    ].join("\n");

    const result = await compileCode(entryCode, {});
    expect(result.diagnostics ?? "").toBe("");
    expect(result.success).toBe(true);
    expect(typeof result.entryJs).toBe("string");

    const mod = await importEsmFromSource(result.entryJs ?? "");
    expect(typeof mod.run).toBe("function");
    expect(mod.run()).toBe(3);
  });
});
