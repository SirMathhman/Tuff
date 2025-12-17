import { describe, expect, test } from "vitest";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { prebuiltSelfhostUrl } from "./test_utils";

describe("lsp_find_definition", () => {
  test("does not crash on compiler sources", async () => {
    const tuffcLib = (await import(
      prebuiltSelfhostUrl("tuffc_lib.mjs")
    )) as any;

    expect(typeof tuffcLib.lsp_find_definition).toBe("function");

    const filePath = resolve(
      "src",
      "main",
      "tuff",
      "compiler",
      "tuffc_lib.tuff"
    );
    const src = readFileSync(filePath, "utf8");

    const offExtern = src.indexOf("vec_len");
    expect(offExtern).toBeGreaterThanOrEqual(0);

    const offTypeUsage = src.indexOf("Vec<LspRefLib>");
    const offType = offTypeUsage + "Vec<".length; // position on the `L` in `LspRefLib`
    expect(offType).toBeGreaterThanOrEqual(0);

    const offModule = src.indexOf("util::diagnostics");
    expect(offModule).toBeGreaterThanOrEqual(0);

    // extern-from symbol (should resolve to the extern decl span)
    const resExtern = tuffcLib.lsp_find_definition(src, offExtern, filePath);
    expect(resExtern.found).toBe(true);
    expect(typeof resExtern.defStart).toBe("number");
    expect(typeof resExtern.defEnd).toBe("number");

    // type mentions in signatures (should resolve to the struct/type decl)
    const resType = tuffcLib.lsp_find_definition(src, offType, filePath);
    expect(resType.found).toBe(true);
    expect(typeof resType.defStart).toBe("number");
    expect(typeof resType.defEnd).toBe("number");

    // module path in `from util::diagnostics use ...` (should resolve to a file path)
    const resModule = tuffcLib.lsp_find_definition(
      src,
      offModule + 1,
      filePath
    );
    expect(resModule.found).toBe(true);
    expect(typeof resModule.defFile).toBe("string");
    expect(resModule.defFile.toLowerCase()).toContain("util");
    expect(resModule.defFile.toLowerCase()).toContain("diagnostics");
  });
});
