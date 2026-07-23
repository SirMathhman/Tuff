import { describe, expect, it } from "bun:test";
import { compile } from "../src/compiler";

describe("Tuff MVP Compiler", () => {
  it("compiles empty program", () => {
    const output = compile("");
    expect(output).toBeDefined();
  });

  // --- Variables ---
  it("compiles let binding with literal", () => {
    const output = compile("let x = 42;");
    expect(output).toContain("x");
  });

  it("compiles multiple let bindings", () => {
    const output = compile("let a = 1; let b = 2;");
    expect(output).toContain("a");
    expect(output).toContain("b");
  });

  // --- Arithmetic ---
  it("compiles addition", () => {
    const output = compile("let x = 1 + 2;");
    expect(output).toContain("+");
  });

  it("compiles subtraction", () => {
    const output = compile("let x = 10 - 3;");
    expect(output).toContain("-");
  });

  it("compiles multiplication", () => {
    const output = compile("let x = 4 * 5;");
    expect(output).toContain("*");
  });

  it("compiles division", () => {
    const output = compile("let x = 10 / 2;");
    expect(output).toContain("/");
  });

  it("compiles modulo", () => {
    const output = compile("let x = 10 % 3;");
    expect(output).toContain("%");
  });

  it("compiles chained arithmetic", () => {
    const output = compile("let x = 1 + 2 * 3;");
    expect(output).toContain("+");
    expect(output).toContain("*");
  });

  // --- Comparison ---
  it("compiles equality", () => {
    const output = compile("let x = 1 == 2;");
    expect(output).toContain("==");
  });

  it("compiles inequality", () => {
    const output = compile("let x = 1 != 2;");
    expect(output).toContain("!=");
  });

  it("compiles less than", () => {
    const output = compile("let x = 1 < 2;");
    expect(output).toContain("<");
  });

  it("compiles greater than", () => {
    const output = compile("let x = 2 > 1;");
    expect(output).toContain(">");
  });

  it("compiles less than or equal", () => {
    const output = compile("let x = 1 <= 2;");
    expect(output).toContain("<=");
  });

  it("compiles greater than or equal", () => {
    const output = compile("let x = 2 >= 1;");
    expect(output).toContain(">=");
  });

  // --- If/Else ---
  it("compiles if expression", () => {
    const output = compile("if (x > 0) { let y = 1; }");
    expect(output).toContain("if");
  });

  it("compiles if/else expression", () => {
    const output = compile("if (x > 0) { let y = 1; } else { let y = 2; }");
    expect(output).toContain("if");
    expect(output).toContain("else");
  });

  it("compiles nested if", () => {
    const output = compile("if (a > 0) { if (b > 0) { let c = 1; } }");
    expect(output).toContain("if");
  });

  // --- While ---
  it("compiles while loop", () => {
    const output = compile("while (x > 0) { let y = x - 1; }");
    expect(output).toContain("while");
  });

  // --- Arrays ---
  it("compiles array literal", () => {
    const output = compile("let arr = [1, 2, 3];");
    expect(output).toContain("[");
  });

  it("compiles array indexing", () => {
    const output = compile("let x = arr[0];");
    expect(output).toContain("arr");
    expect(output).toContain("[");
  });

  it("compiles array indexing with expression", () => {
    const output = compile("let x = arr[i + 1];");
    expect(output).toContain("[");
  });

  // --- Object Literals ---
  it("compiles object literal", () => {
    const output = compile("let obj = { x: 1, y: 2 };");
    expect(output).toContain("{");
    expect(output).toContain("x");
  });

  it("compiles object property access", () => {
    const output = compile("let x = obj.prop;");
    expect(output).toContain("obj");
    expect(output).toContain("prop");
  });

  // --- Functions ---
  it("compiles function with no params", () => {
    const output = compile("fn foo() => 42;");
    expect(output).toContain("function");
    expect(output).toContain("foo");
  });

  it("compiles function with params", () => {
    const output = compile("fn add(a, b) => a + b;");
    expect(output).toContain("function");
    expect(output).toContain("add");
    expect(output).toContain("a");
    expect(output).toContain("b");
  });

  it("compiles function with block body", () => {
    const output = compile("fn foo(x) { let y = x * 2; y + 1; }");
    expect(output).toContain("function");
  });

  it("compiles function call", () => {
    const output = compile("let x = foo(1, 2);");
    expect(output).toContain("foo");
    expect(output).toContain("(");
  });

  // --- Integration: end-to-end program ---
  it("compiles a complete program", () => {
    const source = `
fn add(a, b) => a + b;
let x = 10;
let y = 20;
let sum = add(x, y);
if (sum > 15) {
  let msg = "big";
} else {
  let msg = "small";
}
let arr = [1, 2, 3];
let first = arr[0];
while (first > 0) {
  let zero = 0;
}
`;
    const output = compile(source);
    expect(output).toBeDefined();
    expect(output.length).toBeGreaterThan(0);
  });

  // --- Negative: error cases ---
  it("rejects missing semicolon on let", () => {
    expect(() => compile("let x = 42")).toThrow();
  });

  it("rejects unclosed brace", () => {
    expect(() => compile("if (x) { let y = 1;")).toThrow();
  });

  it("rejects unclosed bracket", () => {
    expect(() => compile("let arr = [1, 2, 3;")).toThrow();
  });
});
