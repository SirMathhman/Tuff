"use strict";

const { describe, it, expect } = require("bun:test");
const { compile } = require("../src/pipeline/compile");

function compileSource(source) {
  try {
    const result = compile({ source, filePath: "test.tuff" });
    return { success: true, code: result.code };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

describe("Code generation", () => {
  describe("Literals and expressions", () => {
    it("generates code for number literals", () => {
      const result = compileSource("42;");
      expect(result.success).toBe(true);
      expect(result.code).toContain("42");
    });

    it("generates code for string literals", () => {
      const result = compileSource('"hello";');
      expect(result.success).toBe(true);
      expect(result.code).toContain("hello");
    });

    it("generates code for arithmetic operations", () => {
      const result = compileSource("5 + 3;");
      expect(result.success).toBe(true);
      expect(result.code).toContain("+");
    });

    it("generates code for comparisons", () => {
      const result = compileSource("5 > 3;");
      expect(result.success).toBe(true);
      expect(result.code).toContain(">");
    });

    it("generates code for logical operations", () => {
      const result = compileSource("true && false;");
      expect(result.success).toBe(true);
      expect(result.code).toContain("&&");
    });
  });

  describe("Variable declarations", () => {
    it("generates let binding", () => {
      const result = compileSource("let x = 5; x;");
      expect(result.success).toBe(true);
      // Immutable let emits const
      expect(result.code).toContain("const x");
    });

    it("generates mutable let binding", () => {
      const result = compileSource("let mut x = 5; x = 10;");
      expect(result.success).toBe(true);
      expect(result.code).toContain("let");
    });
  });

  describe("Functions", () => {
    it("generates function declaration", () => {
      const result = compileSource("fn add(a, b) => a + b;");
      expect(result.success).toBe(true);
      expect(result.code).toContain("function add");
      expect(result.code).toContain("return");
    });

    it("generates function calls", () => {
      const result = compileSource("fn add(a, b) => a + b; add(3, 4);");
      expect(result.success).toBe(true);
      expect(result.code).toContain("add(");
    });

    it("generates function with block body", () => {
      // Block body with tail expression (no semicolon on last expr)
      const result = compileSource("fn test() => { let a = 5; a + 1 };");
      expect(result.success).toBe(true);
      expect(result.code).toContain("function test");
    });
  });

  describe("Control flow", () => {
    it("generates if expressions", () => {
      // if expression needs semicolon when used as statement
      const result = compileSource("if (true) { 5 } else { 10 };");
      expect(result.success).toBe(true);
      expect(result.code).toContain("if");
    });

    it("generates while loops", () => {
      // Simple while loop test
      const result = compileSource(
        "let mut z = 5; while (z > 0) { let y = z; }",
      );
      expect(result.success).toBe(true);
      expect(result.code).toContain("while");
    });

    it("generates for loops", () => {
      // Tuff uses range-based for loops: for (i in 0..10)
      const result = compileSource("for (i in 0..10) { i; }");
      expect(result.success).toBe(true);
      expect(result.code).toContain("for");
    });

    it("generates break statements", () => {
      const result = compileSource("while (true) { break; }");
      expect(result.success).toBe(true);
      expect(result.code).toContain("break");
    });

    it("generates continue statements", () => {
      const result = compileSource("while (true) { continue; }");
      expect(result.success).toBe(true);
      expect(result.code).toContain("continue");
    });
  });

  describe("Arrays", () => {
    it("generates empty array literal", () => {
      const result = compileSource("[];");
      expect(result.success).toBe(true);
      expect(result.code).toContain("[]");
    });

    it("generates array literal with elements", () => {
      const result = compileSource("[1, 2, 3];");
      expect(result.success).toBe(true);
      expect(result.code).toContain("[");
    });

    it("generates array repeat literal", () => {
      const result = compileSource("[42; 5];");
      expect(result.success).toBe(true);
      expect(result.code).toContain("Array");
    });

    it("generates array indexing", () => {
      const result = compileSource("let arr = [1, 2, 3]; arr[0];");
      expect(result.success).toBe(true);
      expect(result.code).toContain("[0]");
    });
  });

  describe("Structs", () => {
    it("generates struct declaration", () => {
      const result = compileSource("struct Point { x; y; }");
      expect(result.success).toBe(true);
      expect(result.code).toContain("Point");
    });

    it("generates struct constructor", () => {
      const result = compileSource("struct Point { x; y; } Point { 1, 2 };");
      expect(result.success).toBe(true);
      expect(result.code).toContain("Point");
    });

    it("generates struct field access", () => {
      const result = compileSource(
        "struct Point { x; y; } let p = Point { 1, 2 }; p.x;",
      );
      expect(result.success).toBe(true);
      expect(result.code).toContain(".x");
    });

    it("generates mutable struct field", () => {
      const result = compileSource(
        "struct State { mut value; } let mut s = State { 0 }; s.value = 5;",
      );
      expect(result.success).toBe(true);
      expect(result.code).toContain("value");
    });
  });

  describe("Enums", () => {
    it("generates enum declaration", () => {
      const result = compileSource("enum Color { Red, Green, Blue }");
      expect(result.success).toBe(true);
      expect(result.code).toContain("Color");
      expect(result.code).toContain("__enum");
    });

    it("generates enum variant", () => {
      const result = compileSource("enum Color { Red } Color::Red;");
      expect(result.success).toBe(true);
      expect(result.code).toContain("Red");
    });

    it("generates match expression for enums", () => {
      // Match cases need scoped enum variants
      const result = compileSource(
        "enum Color { Red, Green } let c = Color::Red; match (c) { case Color::Red => 1; case Color::Green => 2; };",
      );
      expect(result.success).toBe(true);
      expect(result.code).toContain("switch");
    });

    it("generates match with wildcard for non-enum", () => {
      const result = compileSource(
        "let v = 1; match (v) { case 1 => 5; case _ => 10; };",
      );
      expect(result.success).toBe(true);
      expect(result.code).toContain("if");
    });
  });

  describe("Method calls and dot syntax", () => {
    it("generates dot access", () => {
      // Bootstrap struct syntax: no type annotations
      const result = compileSource(
        "struct Point { x; } let p = Point { 1 }; p.x;",
      );
      expect(result.success).toBe(true);
      expect(result.code).toContain(".");
    });

    it("generates prelude helper", () => {
      const result = compileSource("let x = 1;");
      expect(result.success).toBe(true);
      expect(result.code).toContain("__tuff_call");
    });
  });

  describe("Extern use", () => {
    it("generates extern use as require", () => {
      // Bootstrap extern uses bare identifier, not string
      const result = compileSource("extern use { print } from io;");
      expect(result.success).toBe(true);
      expect(result.code).toContain("require");
    });

    it("generates multiple extern imports", () => {
      const result = compileSource("extern use { print, readFile } from io;");
      expect(result.success).toBe(true);
      expect(result.code).toContain("require");
    });
  });

  describe("Complex programs", () => {
    it("generates factorial function", () => {
      // Tail expression without semicolon, proper else branch
      const result = compileSource(`
        fn factorial(n) => if (n == 0) { 1 } else { n * factorial(n - 1) };
        factorial(5);
      `);
      expect(result.success).toBe(true);
      expect(result.code).toContain("factorial");
    });

    it("generates program with multiple declarations", () => {
      // Bootstrap struct syntax: no type annotations
      const result = compileSource(`
        struct Point { x; y; }
        enum Shape { Circle, Square }
        fn distance(p) => p.x * p.x + p.y * p.y;
      `);
      expect(result.success).toBe(true);
      expect(result.code).toContain("Point");
      expect(result.code).toContain("Shape");
      expect(result.code).toContain("distance");
    });

    it("generates proper CommonJS output", () => {
      const result = compileSource("42;");
      expect(result.success).toBe(true);
      expect(result.code).toContain('"use strict"');
    });
  });

  describe("Edge cases", () => {
    it("handles empty program", () => {
      const result = compileSource("");
      expect(result.success).toBe(true);
      expect(result.code).toContain('"use strict"');
    });

    it("handles comments in code", () => {
      const result = compileSource("// comment\n5;");
      expect(result.success).toBe(true);
    });

    it("handles nested function calls", () => {
      const result = compileSource("fn f(x) => x; fn g(x) => f(x); g(1);");
      expect(result.success).toBe(true);
    });

    it("handles nested block expressions", () => {
      // Nested blocks with tail expression
      const result = compileSource("{ { { 5 } } };");
      expect(result.success).toBe(true);
    });
  });

  describe("Operator precedence in output", () => {
    it("respects precedence in generated code", () => {
      const result = compileSource("2 + 3 * 4;");
      expect(result.success).toBe(true);
      expect(result.code).toContain("(3 * 4)");
    });

    it("handles operator associativity", () => {
      const result = compileSource("10 - 5 - 2;");
      expect(result.success).toBe(true);
    });
  });
});
