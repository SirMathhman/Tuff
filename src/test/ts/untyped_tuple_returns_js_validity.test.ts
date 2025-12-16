import { describe, it, expect } from "vitest";
import { compileCode } from "./compiler_api_wrapper";

describe("untyped tuple returns JS validity", () => {
  it("should generate valid ES module JS for untyped tuple returns", async () => {
    const src = `
      fn make_tuple(x: I32) => {
        ("hello", x)
      }
      
      fn main() : I32 => {
        let result = make_tuple(42);
        0
      }
    `;

    const result = await compileCode(src, {});

    expect(
      result.success,
      typeof result.diagnostics === "string" ? result.diagnostics : ""
    ).toBe(true);
    expect(result.entryJs).toBeDefined();

    // Verify the generated code has proper structure:
    // 1. Should have export function main
    // 2. Should have make_tuple helper
    // 3. Should use array literals for tuples
    // 4. Should access tuple elements via array indexing

    const js = result.entryJs!;

    // Check for tuple construction as array literals
    expect(js).toContain('["hello", x]');

    // Check for proper function definitions
    expect(js).toContain("function make_tuple");
    expect(js).toContain("export function main()");

    // Check that result variable is used (tuple construction and storage)
    expect(js).toContain("result");
  });

  it("should generate valid JS for tuple element access", async () => {
    const src = `
      fn make_tuple(x: I32) => {
        ("test", x)
      }
      
      fn main() : I32 => {
        let result = make_tuple(5);
        result.1
      }
    `;

    const result = await compileCode(src, {});

    expect(
      result.success,
      typeof result.diagnostics === "string" ? result.diagnostics : ""
    ).toBe(true);
    expect(result.entryJs).toBeDefined();

    const js = result.entryJs!;

    // Verify tuple is created as array
    expect(js).toContain('["test", x]');

    // Verify element access is via array index
    expect(js).toContain("result[1]");
  });

  it("should handle nested tuple returns", async () => {
    const src = `
      fn nested_tuple(x: I32) => {
        ("a", (x, "b"))
      }
      
      fn main() : I32 => {
        let result = nested_tuple(10);
        0
      }
    `;

    const result = await compileCode(src, {});

    expect(
      result.success,
      typeof result.diagnostics === "string" ? result.diagnostics : ""
    ).toBe(true);
    expect(result.entryJs).toBeDefined();

    const js = result.entryJs!;

    // Nested tuples should be nested arrays
    expect(js).toContain('["a"');
  });

  it("should generate executable JS for tuple element access", async () => {
    const src = `
      fn get_pair() => {
        ("first", 42)
      }
      
      fn main() : I32 => {
        let p = get_pair();
        let a = p.0;
        let b = p.1;
        b
      }
    `;

    const result = await compileCode(src, {});

    expect(
      result.success,
      typeof result.diagnostics === "string" ? result.diagnostics : ""
    ).toBe(true);
    expect(result.entryJs).toBeDefined();

    const js = result.entryJs!;

    // Critical: tuple element access p.0 and p.1 must be converted to p[0] and p[1]
    // If the compiler generates p.0 literally, that's invalid JavaScript
    expect(js).toContain("p[0]");
    expect(js).toContain("p[1]");

    // Must NOT contain invalid dot-number access
    expect(js).not.toContain("p.0");
    expect(js).not.toContain("p.1");

    // Verify the JS is actually executable by checking it doesn't have syntax errors
    // Convert to CommonJS-compatible format for testing
    const testableJs = js.replace(/^export\s+/gm, "");

    try {
      // This will throw if the JS has syntax errors
      new Function(testableJs);
    } catch (e) {
      throw new Error(
        `Generated JavaScript has syntax errors:\n${js}\n\nError: ${e}`
      );
    }
  });

  it("should generate executable JS for helper functions returning tuples", async () => {
    const src = `
      fn parse_name_list(s: String) => {
        (s, 10)
      }
      
      fn process() => {
        let result = parse_name_list("test");
        let name = result.0;
        let pos = result.1;
        (name, pos)
      }
      
      fn main() : I32 => {
        let final_result = process();
        0
      }
    `;

    const result = await compileCode(src, {});

    expect(
      result.success,
      typeof result.diagnostics === "string" ? result.diagnostics : ""
    ).toBe(true);
    expect(result.entryJs).toBeDefined();

    const js = result.entryJs!;

    // Verify tuple element access is via array indexing
    expect(js).toContain("result[0]");
    expect(js).toContain("result[1]");

    // Verify no invalid .0 or .1 access
    expect(js).not.toContain("result.0");
    expect(js).not.toContain("result.1");

    // Verify tuple construction uses array literals
    expect(js).toContain("[s, 10]");
    expect(js).toContain("[name, pos]");
  });
});
