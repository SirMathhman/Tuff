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
        `compileCode failed:\n${r.diagnostics ?? ""}\nrequested module keys: ${requestedKeys.join(
          ", "
        )}`
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
        `importEsmFromOutputs failed: ${e instanceof Error ? e.message : String(e)}\n` +
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

  test("circular dependencies are rejected", async () => {
    const modules = {
      "src::a": ["from src::b use { b };", "out fn a() : I32 => b();", ""].join(
        "\n"
      ),
      "src::b": ["from src::a use { a };", "out fn b() : I32 => a();", ""].join(
        "\n"
      ),
    };

    const entryCode = [
      "from src::a use { a };",
      "fn main() : I32 => a();",
      "",
    ].join("\n");

    const r = await compileCode(entryCode, modules);
    expect(r.success).toBe(false);
    expect(r.diagnostics ?? "").toMatch(/circular|cycle|import/i);
  });
});
