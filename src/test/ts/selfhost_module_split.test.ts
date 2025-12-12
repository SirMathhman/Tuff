import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

// Phase 2 (AST_REFACTOR_PLAN.md): split the selfhost compiler monolith (`tuffc_lib.tuff`)
// into small modules without changing semantics.
//
// This test is intentionally structural: it ensures the split stays in place.

describe("selfhost compiler modules", () => {
  test("tuffc_lib.tuff is a facade over helper modules", async () => {
    const filePath = resolve(
      "src",
      "main",
      "tuff",
      "compiler",
      "tuffc_lib.tuff"
    );

    const src = await readFile(filePath, "utf8");

    // We expect the monolith to start importing extracted modules.
    expect(src).toContain("from diagnostics use");
    expect(src).toContain("from lexing use");
  });
});
