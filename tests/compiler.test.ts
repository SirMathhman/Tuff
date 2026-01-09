/**
 * Compiler tests - validate that interpret(code) === eval(compile(code))
 */

import { describe, it, expect } from "vitest";
import { interpret } from "../src/interpreter";
import { compile } from "../src/compiler";
import { runtime as runtimeLib } from "../src/compiler/runtime";

// Make runtime available in eval context
const runtime = runtimeLib;

/**
 * Helper to evaluate compiled JavaScript code
 * @param code - Tuff source code
 * @returns Result of evaluating compiled code
 */
function evalCompiled(code: string): number {
  const compiled = compile(code);

  // Extract just the body (remove import statement)
  const lines = compiled.split("\n");
  const bodyStart = lines.findIndex(
    (line) =>
      line.trim() && !line.startsWith("//") && !line.startsWith("import")
  );
  const body = lines.slice(bodyStart).join("\n");

  try {
    // Wrap in a function - the compiled code already has return statement
    // Runtime is already defined above in the file scope
    const wrapped = `(function() { ${body} })()`;
    return Number(eval(wrapped));
  } catch (e) {
    console.error("Compilation error:", e);
    console.error("Generated code:", compiled);
    throw e;
  }
}

describe("Compiler - Basic Arithmetic", () => {
  it("should compile integer literals", () => {
    expect(evalCompiled("42")).toBe(interpret("42"));
  });

  it("should compile addition", () => {
    expect(evalCompiled("1 + 2")).toBe(interpret("1 + 2"));
  });

  it("should compile subtraction", () => {
    expect(evalCompiled("10 - 3")).toBe(interpret("10 - 3"));
  });

  it("should compile multiplication", () => {
    expect(evalCompiled("4 * 5")).toBe(interpret("4 * 5"));
  });

  it("should compile division", () => {
    expect(evalCompiled("20 / 4")).toBe(interpret("20 / 4"));
  });

  it("should compile complex expression", () => {
    expect(evalCompiled("2 + 3 * 4")).toBe(interpret("2 + 3 * 4"));
  });
});

describe("Compiler - Variables", () => {
  it("should compile let declaration and use", () => {
    const code = "let x = 10; x";
    expect(evalCompiled(code)).toBe(interpret(code));
  });

  it("should compile multiple variables", () => {
    const code = "let x = 5; let y = 3; x + y";
    expect(evalCompiled(code)).toBe(interpret(code));
  });
});

describe("Compiler - Comparison", () => {
  it("should compile equality", () => {
    expect(evalCompiled("5 == 5")).toBe(interpret("5 == 5"));
  });

  it("should compile inequality", () => {
    expect(evalCompiled("5 != 3")).toBe(interpret("5 != 3"));
  });

  it("should compile less than", () => {
    expect(evalCompiled("3 < 5")).toBe(interpret("3 < 5"));
  });

  it("should compile greater than", () => {
    expect(evalCompiled("5 > 3")).toBe(interpret("5 > 3"));
  });
});

describe("Compiler - Boolean Operations", () => {
  it("should compile boolean literals", () => {
    expect(evalCompiled("true")).toBe(interpret("true"));
    expect(evalCompiled("false")).toBe(interpret("false"));
  });

  it("should compile logical AND", () => {
    expect(evalCompiled("true && true")).toBe(interpret("true && true"));
    expect(evalCompiled("true && false")).toBe(interpret("true && false"));
  });

  it("should compile logical OR", () => {
    expect(evalCompiled("false || true")).toBe(interpret("false || true"));
    expect(evalCompiled("false || false")).toBe(interpret("false || false"));
  });

  // TODO: Add ! operator to parser first
  // it("should compile logical NOT", () => {
  //   expect(evalCompiled("!true")).toBe(interpret("!true"));
  //   expect(evalCompiled("!false")).toBe(interpret("!false"));
  // });
});
