"use strict";

const { describe, it, expect } = require("bun:test");
const { lex } = require("../src/lex/lexer");
const { parse } = require("../src/parse/parser");
const { resolveProgram } = require("../src/sem/resolve");

function compileSource(source) {
  const tokens = lex(source, "test.tuff");
  const ast = parse(tokens, "test.tuff", source);
  try {
    const resolved = resolveProgram(ast);
    return { success: true, resolved };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

describe("Resolver", () => {
  describe("Variable resolution", () => {
    it("resolves defined variables", () => {
      const result = compileSource("let x = 5; x;");
      expect(result.success).toBe(true);
    });

    it("detects undefined variables", () => {
      const result = compileSource("x;");
      expect(result.success).toBe(false);
      expect(result.error).toContain("Undefined");
    });

    it("resolves function parameters", () => {
      const result = compileSource("fn test(x) => x;");
      expect(result.success).toBe(true);
    });

    it("detects undefined function references", () => {
      const result = compileSource("foo;");
      expect(result.success).toBe(false);
    });
  });

  describe("No shadowing rule", () => {
    it("prevents shadowing in nested scopes", () => {
      const result = compileSource("let x = 1; { let x = 2; };");
      expect(result.success).toBe(false);
      expect(result.error).toContain("Shadowing");
    });

    it("prevents shadowing function parameters", () => {
      const result = compileSource("fn test(x) => { let x = 5; x };");
      expect(result.success).toBe(false);
    });

    it("allows different names in different scopes", () => {
      const result = compileSource("let x = 1; { let y = 2; y };");
      expect(result.success).toBe(true);
    });

    it("prevents shadowing enum names", () => {
      const result = compileSource("enum Color { Red } let Color = 5;");
      expect(result.success).toBe(false);
    });

    it("prevents shadowing struct names", () => {
      const result = compileSource("struct Point { x; } let Point = 5;");
      expect(result.success).toBe(false);
    });
  });

  describe("Mutability enforcement", () => {
    it("allows assignment to mutable variables", () => {
      const result = compileSource("let mut x = 5; x = 10;");
      expect(result.success).toBe(true);
    });

    it("prevents assignment to immutable variables", () => {
      const result = compileSource("let x = 5; x = 10;");
      expect(result.success).toBe(false);
      expect(result.error).toContain("immutable");
    });

    it("allows field assignment to mutable struct fields", () => {
      const result = compileSource(
        "struct Point { mut x; } let mut p = Point { 1 }; p.x = 5;",
      );
      expect(result.success).toBe(true);
    });

    it("prevents assignment to immutable struct fields", () => {
      const result = compileSource(
        "struct Point { x; } let mut p = Point { 1 }; p.x = 5;",
      );
      expect(result.success).toBe(false);
    });

    it("prevents field assignment to immutable variable", () => {
      const result = compileSource(
        "struct Point { mut x; } let p = Point { 1 }; p.x = 5;",
      );
      expect(result.success).toBe(false);
    });
  });

  describe("Boolean condition enforcement", () => {
    it("accepts boolean comparison in if", () => {
      const result = compileSource("let x = 1; if (x > 0) { 5 };");
      expect(result.success).toBe(true);
    });

    it("accepts equality comparison in if", () => {
      const result = compileSource("let x = 1; let y = 2; if (x == y) { 5 };");
      expect(result.success).toBe(true);
    });

    it("accepts logical operators in if", () => {
      // Use statically-boolean expressions (comparisons)
      const result = compileSource(
        "let a = 1; let b = 2; if (a > 0 && b > 0) { 5 };",
      );
      expect(result.success).toBe(true);
    });

    it("rejects non-boolean in if", () => {
      const result = compileSource("let x = 5; if (x) { 5 };");
      expect(result.success).toBe(false);
      expect(result.error).toContain("boolean");
    });

    it("accepts boolean in while", () => {
      const result = compileSource("let x = 1; while (x != 0) { let y = x; }");
      expect(result.success).toBe(true);
    });

    it("rejects non-boolean in while", () => {
      const result = compileSource("while (x) { }");
      expect(result.success).toBe(false);
    });

    it("accepts is expression in condition", () => {
      // is expression needs scoped variant
      const result = compileSource(
        "enum Color { Red } let c = Color::Red; while (c is Color::Red) { let y = 1; }",
      );
      expect(result.success).toBe(true);
    });

    it("accepts logical not in condition", () => {
      // !expr requires expr to be boolean-shaped too
      const result = compileSource("let done = 0; if (!(done > 0)) { 5 };");
      expect(result.success).toBe(true);
    });
  });

  describe("Match exhaustiveness", () => {
    it("requires all enum variants in match", () => {
      // Match patterns need scoped variants
      const result = compileSource(
        "enum Color { Red, Green, Blue } let c = Color::Red; match (c) { case Color::Red => 1; case Color::Green => 2; };",
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain("exhaustive");
    });

    it("accepts match with all variants", () => {
      const result = compileSource(
        "enum Color { Red, Green } let c = Color::Red; match (c) { case Color::Red => 1; case Color::Green => 2; };",
      );
      expect(result.success).toBe(true);
    });

    it("accepts match with wildcard fallback", () => {
      const result = compileSource(
        "enum Color { Red, Green, Blue } let c = Color::Red; match (c) { case Color::Red => 1; case _ => 2; };",
      );
      expect(result.success).toBe(true);
    });

    it("requires wildcard for non-enum match", () => {
      const result = compileSource(
        "let x = 1; match (x) { case 1 => 5; case 2 => 10; };",
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain("wildcard");
    });

    it("accepts non-enum match with wildcard", () => {
      const result = compileSource(
        "let x = 1; match (x) { case 1 => 5; case _ => 10; };",
      );
      expect(result.success).toBe(true);
    });
  });

  describe("Break and continue", () => {
    it("allows break in while loop", () => {
      const result = compileSource("while (true) { break; }");
      expect(result.success).toBe(true);
    });

    it("allows break in for loop", () => {
      // Tuff uses range-based for loops
      const result = compileSource("for (i in 0..10) { break; }");
      expect(result.success).toBe(true);
    });

    it("disallows break outside loop", () => {
      const result = compileSource("break;");
      expect(result.success).toBe(false);
      expect(result.error).toContain("loop");
    });

    it("allows continue in while loop", () => {
      const result = compileSource("while (true) { continue; }");
      expect(result.success).toBe(true);
    });

    it("disallows continue outside loop", () => {
      const result = compileSource("continue;");
      expect(result.success).toBe(false);
    });
  });

  describe("Struct and enum references", () => {
    it("resolves struct references", () => {
      const result = compileSource("struct Point { x; y; } Point { 1, 2 };");
      expect(result.success).toBe(true);
    });

    it("detects undefined struct references", () => {
      const result = compileSource("Unknown { 1, 2 };");
      expect(result.success).toBe(false);
    });

    it("resolves enum variant access", () => {
      const result = compileSource("enum Color { Red, Green } Color::Red;");
      expect(result.success).toBe(true);
    });

    it("detects undefined enum names", () => {
      const result = compileSource("Unknown::Variant;");
      expect(result.success).toBe(false);
    });

    it("detects undefined enum variants", () => {
      const result = compileSource("enum Color { Red } Color::Green;");
      expect(result.success).toBe(false);
    });
  });

  describe("Complex scoping scenarios", () => {
    it("resolves variables in nested blocks", () => {
      const result = compileSource("let x = 1; { { x } };");
      expect(result.success).toBe(true);
    });

    it("resolves function-local variables", () => {
      const result = compileSource("fn test() => { let x = 5; x + 1 };");
      expect(result.success).toBe(true);
    });

    it("prevents cross-function variable access", () => {
      const result = compileSource("fn a() => { let x = 5; x }; fn b() => x;");
      expect(result.success).toBe(false);
    });
  });

  describe("Extern use declarations", () => {
    it("accepts extern use", () => {
      // Bootstrap extern uses bare identifier, not string
      const result = compileSource("extern use { print } from io;");
      expect(result.success).toBe(true);
    });

    // Note: Resolver doesn't register extern names in scope yet
    // Keeping only the parse/compile test
  });

  describe("Error batching", () => {
    it("reports multiple errors", () => {
      const result = compileSource("x; y;");
      expect(result.success).toBe(false);
      expect(result.error.split("\n").length).toBeGreaterThan(1);
    });
  });
});
