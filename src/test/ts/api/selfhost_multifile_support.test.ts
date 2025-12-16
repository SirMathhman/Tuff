import { describe, expect, test } from "vitest";

import { compileCode, importEsmFromOutputs } from "../compiler_api_wrapper";

describe("selfhost multi-file module support (in-memory)", () => {
  test("out fn exports across modules can be imported and executed", async () => {
    const requestedKeys: string[] = [];
    const baseModules = {
      "src::util::math":
        "out fn add(first: I32, second: I32) : I32 => first + second;\n",
    };
    const modules = new Proxy(baseModules, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      get(target: any, prop: any) {
        if (typeof prop === "string") requestedKeys.push(prop);
        return target[prop];
      },
    }) as unknown as typeof baseModules;

    const entryCode = [
      "from src::util::math use { add };",
      "fn main() : I32 => add(1, 2);",
      "",
    ].join("\n");

    const r = await compileCode(entryCode, modules);
    if (!r.success) {
      throw new Error(
        `compileCode failed:\n${
          r.diagnostics ?? ""
        }\nrequested module keys: ${requestedKeys.join(", ")}`
      );
    }
    expect(r.success).toBe(true);
    expect(Array.isArray(r.outRelPaths)).toBe(true);
    expect(Array.isArray(r.jsOutputs)).toBe(true);

    let mod: any;
    try {
      mod = await importEsmFromOutputs(
        r.outRelPaths as string[],
        r.jsOutputs as string[]
      );
    } catch (e) {
      throw new Error(
        `importEsmFromOutputs failed: ${
          e instanceof Error ? e.message : String(e)
        }\n` +
          `outRelPaths: ${(r.outRelPaths ?? []).join(", ")}\n` +
          `entryJs snippet: ${String(r.entryJs ?? "").slice(0, 300)}\n` +
          `requested module keys: ${requestedKeys.join(", ")}`
      );
    }
    expect(typeof mod.main).toBe("function");
    expect(mod.main()).toBe(3);
  });

  test("imported function signature is validated (arity)", async () => {
    const modules = {
      "src::util::math":
        "out fn add(first: I32, second: I32) : I32 => first + second;\n",
    };

    const entryCode = [
      "from src::util::math use { add };",
      "fn main() : I32 => add(1);",
      "",
    ].join("\n");

    const r = await compileCode(entryCode, modules);
    expect(r.success).toBe(false);
    expect(r.diagnostics ?? "").toMatch(/wrong number of args|arity|add\(/i);
  });

  test("circular dependencies are allowed", async () => {
    const modules = {
      // Cycle via imports, but no runtime recursion.
      "src::a": [
        "from src::b use { b_const };",
        "out fn a_const() : I32 => 1;",
        "",
      ].join("\n"),
      "src::b": [
        "from src::a use { a_const };",
        "out fn b_const() : I32 => 2;",
        "",
      ].join("\n"),
    };

    const entryCode = [
      "from src::a use { a_const };",
      "from src::b use { b_const };",
      "fn main() : I32 => a_const() + b_const();",
      "",
    ].join("\n");

    const r = await compileCode(entryCode, modules);
    if (!r.success) {
      throw new Error(`compileCode failed:\n${r.diagnostics ?? ""}`);
    }
    const mod: any = await importEsmFromOutputs(
      r.outRelPaths as string[],
      r.jsOutputs as string[]
    );
    expect(mod.main()).toBe(3);
  });

  test("circular dependencies work with closures", async () => {
    const modules = {
      // A imports B and returns a closure that calls B.
      "src::a": [
        "from src::b use { b_const };",
        "out fn make_adder() : () => I32 => {",
        "  let extra: I32 = 1;",
        "  () : I32 => b_const() + extra",
        "};",
        "",
      ].join("\n"),
      // B imports A (cycle) but does not eagerly read it during module init.
      "src::b": [
        "from src::a use { make_adder };",
        "out fn b_const() : I32 => 2;",
        "out fn run() : I32 => {",
        "  let f = make_adder();",
        "  f()",
        "};",
        "",
      ].join("\n"),
    };

    const entryCode = [
      "from src::b use { run };",
      "fn main() : I32 => run();",
      "",
    ].join("\n");

    const r = await compileCode(entryCode, modules);
    if (!r.success) {
      throw new Error(`compileCode failed:\n${r.diagnostics ?? ""}`);
    }

    // Import the cyclic module directly to assert its exports exist.
    const modB: any = await importEsmFromOutputs(
      r.outRelPaths as string[],
      r.jsOutputs as string[],
      "src/b.mjs"
    );
    if (typeof modB.run !== "function") {
      const rels = (r.outRelPaths ?? []) as string[];
      const idx = rels.findIndex((p) => p.replace(/\\/g, "/") === "src/b.mjs");
      const bSrc =
        idx >= 0
          ? String((r.jsOutputs ?? [])[idx] ?? "")
          : "<missing src/b.mjs>";
      throw new Error(
        `expected src/b.mjs to export run() as a function, but got: ${typeof modB.run}\n` +
          `exports: ${Object.keys(modB).join(", ")}\n` +
          `--- src/b.mjs ---\n${bSrc.slice(0, 400)}\n--- end ---\n`
      );
    }
    expect(modB.run()).toBe(3);
  });
});
