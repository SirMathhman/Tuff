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

    expect(result.success, typeof result.diagnostics === 'string' ? result.diagnostics : '').toBe(true);
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
    expect(js).toContain('function make_tuple');
    expect(js).toContain('export function main()');
    
    // Check that result variable is used (tuple construction and storage)
    expect(js).toContain('result');
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

    expect(result.success, typeof result.diagnostics === 'string' ? result.diagnostics : '').toBe(true);
    expect(result.entryJs).toBeDefined();

    const js = result.entryJs!;
    
    // Verify tuple is created as array
    expect(js).toContain('["test", x]');
    
    // Verify element access is via array index
    expect(js).toContain('result[1]');
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

    expect(result.success, typeof result.diagnostics === 'string' ? result.diagnostics : '').toBe(true);
    expect(result.entryJs).toBeDefined();

    const js = result.entryJs!;
    
    // Nested tuples should be nested arrays
    expect(js).toContain('["a"');
  });
});
