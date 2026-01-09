import { describe, it, expect } from "vitest";
import {
  tokenize,
  parseProgram,
  astExprToString,
  astStmtToString,
  isLetStatement,
  isIfStatement,
  isWhileStatement,
  isForStatement,
  isFnDeclaration,
  isStructDeclaration,
  isExpressionStatement,
} from "../src/parser";

// Helper to parse and get the first expression statement
function parseExprKind(src: string): string {
  const stmts = parseProgram(src);
  const s = stmts[0];
  if (!isExpressionStatement(s)) throw new Error("Expected ExprStmt");
  return s.expr.kind;
}

// Helper to parse and get the if statement's false branch length
function getIfElseBranchLen(src: string): number {
  const stmts = parseProgram(src);
  const s = stmts[0];
  if (!isIfStatement(s)) throw new Error("Expected IfStatement");
  return s.falseBranch?.length ?? 0;
}

describe("tokenize", () => {
  it("tokenizes let statement", () => {
    const tokens = tokenize("let x = 10");
    expect(tokens[0]).toMatchObject({ kind: "keyword", value: "let" });
    expect(tokens[1]).toMatchObject({ kind: "identifier", value: "x" });
    expect(tokens[2]).toMatchObject({ kind: "punctuation", value: "=" });
    expect(tokens[3]).toMatchObject({
      kind: "literal",
      literalKind: "int",
      value: "10",
    });
    expect(tokens[4]).toMatchObject({ kind: "eof" });
  });

  it("tokenizes if statement", () => {
    const tokens = tokenize("if (x < 5) { y }");
    expect(tokens[0]).toMatchObject({ kind: "keyword", keyword: "if" });
    expect(tokens[1]).toMatchObject({ kind: "delimiter", value: "(" });
    expect(tokens[2]).toMatchObject({ kind: "identifier", value: "x" });
    expect(tokens[3]).toMatchObject({ kind: "operator", value: "<" });
    expect(tokens[4]).toMatchObject({ kind: "literal", value: "5" });
    expect(tokens[5]).toMatchObject({ kind: "delimiter", value: ")" });
  });

  it("tokenizes multi-char operators", () => {
    const tokens = tokenize("a || b && c == d != e");
    const ops = tokens.filter((t) => t.kind === "operator").map((t) => t.value);
    expect(ops).toEqual(["||", "&&", "==", "!="]);
  });

  it("tokenizes string literals", () => {
    const tokens = tokenize('"hello world"');
    expect(tokens[0]).toMatchObject({
      kind: "literal",
      literalKind: "string",
      value: "hello world",
    });
  });

  it("tokenizes numeric suffixes", () => {
    const tokens = tokenize("100U8 200I32");
    expect(tokens[0]).toMatchObject({ kind: "literal", suffix: "U8" });
    expect(tokens[1]).toMatchObject({ kind: "literal", suffix: "I32" });
  });

  it("tokenizes float literals", () => {
    const tokens = tokenize("3.14");
    expect(tokens[0]).toMatchObject({ kind: "literal", literalKind: "float" });
  });

  it("skips comments", () => {
    const lineComment = tokenize("let x // comment\n= 10");
    const blockComment = tokenize("let /* comment */ x = 10");
    const lineVals = lineComment
      .filter((t) => t.kind !== "eof")
      .map((t) => t.value);
    const blockVals = blockComment
      .filter((t) => t.kind !== "eof")
      .map((t) => t.value);
    expect(lineVals).toEqual(["let", "x", "=", "10"]);
    expect(blockVals).toEqual(["let", "x", "=", "10"]);
  });
});

describe("parseProgram", () => {
  describe("let statements", () => {
    it("parses simple let", () => {
      const stmts = parseProgram("let x = 10");
      expect(stmts).toHaveLength(1);
      const s = stmts[0];
      if (!isLetStatement(s)) throw new Error("Expected LetStatement");
      expect(s.kind).toBe("let");
      expect(s.name).toBe("x");
      expect(s.isMutable).toBe(false);
      expect(s.rhs?.kind).toBe("int");
    });

    it("parses mutable let", () => {
      const stmts = parseProgram("let mut y = 20");
      const s = stmts[0];
      if (!isLetStatement(s)) throw new Error("Expected LetStatement");
      expect(s.isMutable).toBe(true);
      expect(s.name).toBe("y");
    });

    it("parses let with annotation", () => {
      const stmts = parseProgram("let z: U8 = 5");
      const s = stmts[0];
      if (!isLetStatement(s)) throw new Error("Expected LetStatement");
      expect(s.annotation).toBe("U8");
    });

    it("parses declaration-only let", () => {
      const stmts = parseProgram("let decl: I32");
      const s = stmts[0];
      if (!isLetStatement(s)) throw new Error("Expected LetStatement");
      expect(s.isDeclOnly).toBe(true);
      expect(s.rhs).toBeUndefined();
    });
  });

  describe("if statements", () => {
    it("parses simple if", () => {
      const stmts = parseProgram("if (x < 5) { y }");
      const s = stmts[0];
      if (!isIfStatement(s)) throw new Error("Expected IfStatement");
      expect(s.kind).toBe("if");
      expect(s.condition.kind).toBe("binary");
      expect(s.trueBranch).toHaveLength(1);
      expect(s.falseBranch).toBeUndefined();
    });

    it("parses if-else", () => {
      expect(getIfElseBranchLen("if (a) { b } else { c }")).toBe(1);
    });

    it("parses if-else-if", () => {
      const s = parseProgram("if (a) { b } else if (c) { d }")[0];
      if (!isIfStatement(s)) throw new Error("Expected IfStatement");
      expect(s.falseBranch).toHaveLength(1);
      expect(s.falseBranch![0].kind).toBe("if");
    });
  });

  describe("while statements", () => {
    it("parses while loop", () => {
      const stmts = parseProgram("while (x > 0) { x }");
      const s = stmts[0];
      if (!isWhileStatement(s)) throw new Error("Expected WhileStatement");
      expect(s.kind).toBe("while");
      expect(s.condition.kind).toBe("binary");
      expect(s.body).toHaveLength(1);
    });
  });

  describe("for statements", () => {
    it("parses for loop", () => {
      const stmts = parseProgram("for (let i in 0..10) { i }");
      const s = stmts[0];
      if (!isForStatement(s)) throw new Error("Expected ForStatement");
      expect(s.kind).toBe("for");
      expect(s.loopVar).toBe("i");
      expect(s.isMutable).toBe(false);
    });

    it("parses mutable for loop", () => {
      const stmts = parseProgram("for (let mut j in 1..5) { j }");
      const s = stmts[0];
      if (!isForStatement(s)) throw new Error("Expected ForStatement");
      expect(s.isMutable).toBe(true);
      expect(s.loopVar).toBe("j");
    });
  });

  describe("function declarations", () => {
    it("parses arrow function", () => {
      const stmts = parseProgram("fn add(a, b) => a + b");
      const s = stmts[0];
      if (!isFnDeclaration(s)) throw new Error("Expected FnDeclaration");
      expect(s.kind).toBe("fn");
      expect(s.name).toBe("add");
      expect(s.params).toHaveLength(2);
      expect(s.isBlock).toBe(false);
    });

    it("parses block function", () => {
      const stmts = parseProgram("fn greet() { 42 }");
      const s = stmts[0];
      if (!isFnDeclaration(s)) throw new Error("Expected FnDeclaration");
      expect(s.isBlock).toBe(true);
      expect(Array.isArray(s.body)).toBe(true);
    });

    it("parses function with annotations", () => {
      const stmts = parseProgram("fn typed(x: I32): I32 => x");
      const s = stmts[0];
      if (!isFnDeclaration(s)) throw new Error("Expected FnDeclaration");
      expect(s.params[0].annotation).toBe("I32");
      expect(s.resultAnnotation).toBe("I32");
    });
  });

  describe("struct declarations", () => {
    it("parses struct", () => {
      const stmts = parseProgram("struct Point { x: I32, y: I32 }");
      const s = stmts[0];
      if (!isStructDeclaration(s)) throw new Error("Expected StructDecl");
      expect(s.kind).toBe("struct");
      expect(s.name).toBe("Point");
      expect(s.fields).toHaveLength(2);
    });
  });

  describe("expressions", () => {
    it("parses binary operations", () => {
      const stmts = parseProgram("1 + 2 * 3");
      const s = stmts[0];
      if (!isExpressionStatement(s)) throw new Error("Expected ExprStmt");
      expect(s.kind).toBe("expression");
      expect(s.expr.kind).toBe("binary");
    });

    it("parses function calls", () => {
      const stmts = parseProgram("foo(1, 2, 3)");
      const s = stmts[0];
      if (!isExpressionStatement(s)) throw new Error("Expected ExprStmt");
      const call = s.expr;
      expect(call.kind).toBe("call");
      if (call.kind === "call") {
        expect(call.args).toHaveLength(3);
      }
    });

    it("parses member access", () => {
      expect(parseExprKind("obj.field")).toBe("member");
    });

    it("parses index access", () => {
      expect(parseExprKind("arr[0]")).toBe("index");
    });

    it("parses array literals", () => {
      expect(parseExprKind("[1, 2, 3]")).toBe("array");
    });

    it("parses unary operators", () => {
      const testCases = ["-x", "*ptr", "&x"];
      for (const input of testCases) {
        expect(parseExprKind(input)).toBe("unary");
      }
    });
  });

  describe("assignments", () => {
    it("parses simple assignment", () => {
      const stmts = parseProgram("x = 10");
      expect(stmts[0].kind).toBe("assignment");
    });

    it("parses compound assignment", () => {
      const stmts = parseProgram("x += 5");
      expect(stmts[0].kind).toBe("assignment");
    });
  });
});

describe("astToString", () => {
  it("converts let statement", () => {
    expect(astStmtToString(parseProgram("let x = 10")[0])).toBe("let x = 10");
  });

  it("converts mutable let", () => {
    expect(astStmtToString(parseProgram("let mut y = 5")[0])).toBe("let mut y = 5");
  });

  it("converts let with annotation", () => {
    expect(astStmtToString(parseProgram("let z: U8 = 3")[0])).toBe("let z: U8 = 3");
  });

  it("converts binary expression", () => {
    const s = parseProgram("1 + 2")[0];
    if (!isExpressionStatement(s)) throw new Error("Expected ExprStmt");
    expect(astExprToString(s.expr)).toContain("+");
  });

  it("converts function call", () => {
    const s = parseProgram("add(1, 2)")[0];
    if (!isExpressionStatement(s)) throw new Error("Expected ExprStmt");
    expect(astExprToString(s.expr)).toBe("add(1, 2)");
  });
});
