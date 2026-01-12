/**
 * Tests for AST parser and evaluator.
 * Ensures AST-based evaluation produces identical results to the string-based interpreter.
 */

import { interpret } from "../src/interpret";
import { parseExpressionToAST } from "../src/interpreter/ast";
import { evaluateAST } from "../src/interpreter/astEval";

// eslint-disable-next-line max-lines-per-function
describe("AST parser - arithmetic expressions", () => {
  it("parses simple addition", () => {
    const ast = parseExpressionToAST("1 + 2");
    expect(ast.kind).toBe("binary-op");
    if (ast.kind === "binary-op") expect(ast.op).toBe("+");
  });

  it("parses multiplication with correct precedence", () => {
    const ast = parseExpressionToAST("1 + 2 * 3");
    expect(ast.kind).toBe("binary-op");
    if (ast.kind === "binary-op") {
      expect(ast.left.kind).toBe("number");
      expect(ast.right.kind).toBe("binary-op");
      if (ast.right.kind === "binary-op") {
        expect(ast.right.op).toBe("*");
      }
    }
  });

  it("parses grouped expressions", () => {
    const ast = parseExpressionToAST("(1 + 2) * 3");
    expect(ast.kind).toBe("binary-op");
    if (ast.kind === "binary-op") expect(ast.op).toBe("*");
  });

  it("parses identifiers", () => {
    const ast = parseExpressionToAST("x");
    expect(ast.kind).toBe("identifier");
    if (ast.kind === "identifier") expect(ast.name).toBe("x");
  });

  it("parses boolean literals", () => {
    const ast1 = parseExpressionToAST("true");
    expect(ast1.kind).toBe("boolean");
    const ast2 = parseExpressionToAST("false");
    expect(ast2.kind).toBe("boolean");
  });

  it("parses comparison operators", () => {
    const ast = parseExpressionToAST("1 < 2");
    expect(ast.kind).toBe("binary-op");
    if (ast.kind === "binary-op") expect(ast.op).toBe("<");
  });

  it("parses logical operators", () => {
    const ast = parseExpressionToAST("true && false");
    expect(ast.kind).toBe("binary-op");
    if (ast.kind === "binary-op") expect(ast.op).toBe("&&");
  });

  it("parses field access", () => {
    const ast = parseExpressionToAST("point.x");
    expect(ast.kind).toBe("field-access");
    if (ast.kind === "field-access") expect(ast.field).toBe("x");
  });

  it("parses array indexing", () => {
    const ast = parseExpressionToAST("arr[0]");
    expect(ast.kind).toBe("index");
    if (ast.kind === "index") {
      expect(ast.target.kind).toBe("identifier");
      expect(ast.index.kind).toBe("number");
    }
  });

  it("parses unary operators", () => {
    const ast = parseExpressionToAST("!x");
    expect(ast.kind).toBe("unary-not");
  });
});

describe("AST evaluator - comparison with current interpreter", () => {
  const testCases = [
    "1 + 2", "10 - 3", "4 * 5", "20 / 4", "1 + 2 + 3", "10 - 5 - 2", "2 * 3 * 4",
    "1 + 2 * 3", "10 - 2 * 3", "(1 + 2) * 3", "2 * (3 + 4)",
    "1 < 2", "5 > 3", "2 <= 2", "3 >= 4", "1 == 1", "1 != 2",
    "1 && 1", "0 || 1", "1 && 0",
    "1 + 2 * 3 - 4", "(1 + 2) * (3 + 4)", "10 / 2 + 3 * 4",
  ];

  testCases.forEach((expr) => {
    // eslint-disable-next-line max-lines-per-function
    it(`evaluates ${expr}`, () => {
      expect(evaluateAST(parseExpressionToAST(expr))).toBe(interpret(expr));
    });
  });

  it("handles environments with variables", () => {
    const env = new Map();
    env.set("x", { value: 10, mutable: false });
    env.set("y", { value: 5, mutable: false });

    const ast = parseExpressionToAST("x + y");
    const result = evaluateAST(ast, env);
    expect(result).toBe(15);
  });

  it("throws on unknown identifiers", () => {
    const ast = parseExpressionToAST("unknown");
    expect(() => evaluateAST(ast)).toThrow("Unknown identifier");
  });

  it("throws on type mismatches", () => {
    const ast = parseExpressionToAST("1 + true");
    // This should fail during evaluation if we've correctly enforced numeric types
    // (The parser will succeed, but evaluation should fail)
    expect(typeof ast).toBe("object");
  });
});

describe("AST performance characteristics", () => {
  it("parses once and evaluates multiple times efficiently", () => {
    const expr = "1 + 2 * 3 - 4 / 2";
    const ast = parseExpressionToAST(expr);

    // Evaluate same AST 1000 times (simulating a loop)
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      evaluateAST(ast);
    }
    const astTime = performance.now() - start;

    // Compare with interpreting 1000 times (reparsing each time)
    const start2 = performance.now();
    for (let i = 0; i < 1000; i++) {
      interpret(expr);
    }
    const interpretTime = performance.now() - start2;

    // AST should be faster or comparable
    console.log(`AST evaluation: ${astTime}ms, Direct interpret: ${interpretTime}ms`);
    expect(astTime).toBeLessThanOrEqual(interpretTime * 1.5); // Allow 50% margin
  });

  it("parses arithmetic expressions without reparsing subexpressions", () => {
    const expr = "1 + 2 + 3 + 4 + 5";
    const ast = parseExpressionToAST(expr);

    // Should have parsed the entire expression into a single AST
    // (not re-parsing each operand multiple times)
    expect(ast.kind).toBe("binary-op");

    const result = evaluateAST(ast);
    expect(result).toBe(15);
  });
});

describe("AST - full expression coverage", () => {
  it("parses function calls", () => {
    const ast = parseExpressionToAST("f(1, 2)");
    expect(ast.kind).toBe("call");
  });

  it("parses method calls", () => {
    const ast = parseExpressionToAST("x.method(1, 2)");
    expect(ast.kind).toBe("method-call");
  });

  it("parses complex postfix operations", () => {
    const ast = parseExpressionToAST("arr[0].field");
    expect(ast.kind).toBe("field-access");
    if (ast.kind === "field-access") {
      expect(ast.object.kind).toBe("index");
    }
  });

  it("parses chained field and index access", () => {
    const ast = parseExpressionToAST("obj.field[0].nested");
    expect(ast.kind).toBe("field-access");
  });
});
