import { tokenize } from "../src/interpreter/lexer";
import { parse } from "../src/interpreter/parser";
import { executeProgram, evaluateExpression } from "../src/interpreter/executor";
import type { Env } from "../src/interpreter/types";
import { Parser } from "../src/interpreter/parser";

// Helper to run program through Lexer -> Parser -> Executor pipeline
function run(source: string, env?: Env): unknown {
  const tokens = tokenize(source);
  const program = parse(tokens);
  return executeProgram(program, env);
}

// Helper to evaluate expression
function expr(source: string, env?: Env): unknown {
  const tokens = tokenize(source);
  const ast = new Parser(tokens).parseExpression();
  return evaluateExpression(ast, env ?? new Map());
}

describe("Executor - basic expressions", () => {
  it("evaluates number literal", () => {
    expect(expr("42")).toBe(42);
  });

  it("evaluates negative number", () => {
    expect(expr("-5")).toBe(-5);
  });

  it("evaluates boolean literals", () => {
    expect(expr("true")).toBe(1);
    expect(expr("false")).toBe(0);
  });

  it("evaluates addition", () => {
    expect(expr("1 + 2")).toBe(3);
  });

  it("evaluates subtraction", () => {
    expect(expr("5 - 3")).toBe(2);
  });

  it("evaluates multiplication", () => {
    expect(expr("4 * 3")).toBe(12);
  });

  it("evaluates division", () => {
    expect(expr("10 / 3")).toBe(3);
  });

  it("throws on division by zero", () => {
    expect(() => expr("10 / 0")).toThrow("Division by zero");
  });

  it("respects precedence", () => {
    expect(expr("2 + 3 * 4")).toBe(14);
    expect(expr("(2 + 3) * 4")).toBe(20);
  });
});

describe("Executor - comparison operators", () => {
  it("evaluates less than", () => {
    expect(expr("3 < 5")).toBe(1);
    expect(expr("5 < 3")).toBe(0);
  });

  it("evaluates greater than", () => {
    expect(expr("5 > 3")).toBe(1);
    expect(expr("3 > 5")).toBe(0);
  });

  it("evaluates equality", () => {
    expect(expr("5 == 5")).toBe(1);
    expect(expr("5 == 3")).toBe(0);
  });

  it("evaluates inequality", () => {
    expect(expr("5 != 3")).toBe(1);
    expect(expr("5 != 5")).toBe(0);
  });
});

describe("Executor - logical operators", () => {
  it("evaluates logical AND", () => {
    expect(expr("true && true")).toBe(1);
    expect(expr("true && false")).toBe(0);
    expect(expr("false && true")).toBe(0);
  });

  it("evaluates logical OR", () => {
    expect(expr("false || true")).toBe(1);
    expect(expr("true || false")).toBe(1);
    expect(expr("false || false")).toBe(0);
  });

  it("evaluates logical NOT", () => {
    expect(expr("!true")).toBe(0);
    expect(expr("!false")).toBe(1);
  });
});

describe("Executor - variables", () => {
  it("evaluates let declaration and lookup", () => {
    expect(run("let x = 5; x")).toBe(5);
  });

  it("evaluates mutable assignment", () => {
    expect(run("let mut x = 0; x = 10; x")).toBe(10);
  });

  it("throws on immutable assignment", () => {
    expect(() => run("let x = 5; x = 10;")).toThrow("Cannot assign to immutable variable");
  });

  it("evaluates compound assignment", () => {
    expect(run("let mut x = 5; x += 3; x")).toBe(8);
    expect(run("let mut x = 10; x -= 2; x")).toBe(8);
    expect(run("let mut x = 4; x *= 3; x")).toBe(12);
  });
});

describe("Executor - control flow", () => {
  it("evaluates if expression", () => {
    expect(run("let x = if (true) 10 else 20; x")).toBe(10);
    expect(run("let x = if (false) 10 else 20; x")).toBe(20);
  });

  it("evaluates while loop", () => {
    expect(run("let mut x = 0; while (x < 5) x += 1; x")).toBe(5);
  });

  it("handles break in while loop", () => {
    expect(run("let mut x = 0; while (true) { x += 1; if (x == 3) break; } x")).toBe(3);
  });

  it("handles continue in while loop", () => {
    expect(run("let mut sum = 0; let mut i = 0; while (i < 5) { i += 1; if (i == 3) continue; sum += i; } sum")).toBe(12);
  });

  it("evaluates for loop", () => {
    expect(run("let mut sum = 0; for (let i in 0..5) sum += i; sum")).toBe(10);
  });
});

describe("Executor - functions", () => {
  it("evaluates function definition and call", () => {
    expect(run("fn add(a: I32, b: I32) => a + b; add(2, 3)")).toBe(5);
  });

  it("evaluates function with return", () => {
    expect(run("fn early(x: I32) => { if (x > 0) return 1; 0 }; early(5)")).toBe(1);
  });

  it("throws on argument count mismatch", () => {
    expect(() => run("fn add(a: I32, b: I32) => a + b; add(1)")).toThrow("Argument count mismatch");
  });
});

describe("Executor - arrays", () => {
  it("evaluates array literal and indexing", () => {
    expect(run("let arr = [1, 2, 3]; arr[1]")).toBe(2);
  });

  it("evaluates array assignment", () => {
    expect(run("let mut arr : [I32; 3; 3] = [1, 2, 3]; arr[0] = 10; arr[0]")).toBe(10);
  });

  it("evaluates array length", () => {
    expect(run("let arr = [1, 2, 3]; arr.length")).toBe(3);
  });
});

describe("Executor - blocks", () => {
  it("evaluates block with final expression", () => {
    expect(run("let x = { let a = 1; let b = 2; a + b }; x")).toBe(3);
  });

  it("evaluates yield in block", () => {
    expect(run("let x = { yield 42; 0 }; x")).toBe(42);
  });
});

describe("Executor - match expressions", () => {
  it("evaluates match with literal patterns", () => {
    expect(run("let x = match (2) { case 1 => 10; case 2 => 20; case _ => 0; }; x")).toBe(20);
  });

  it("evaluates match with wildcard", () => {
    expect(run("let x = match (99) { case 1 => 10; case _ => 0; }; x")).toBe(0);
  });
});

describe("Executor - pipeline integration", () => {
  it("runs a complete program", () => {
    const program = `
      fn factorial(n: I32) => {
        if (n <= 1) 1
        else n * factorial(n - 1)
      };
      factorial(5)
    `;
    expect(run(program)).toBe(120);
  });

  it("handles complex expression", () => {
    expect(run("(1 + 2) * (3 + 4)")).toBe(21);
  });
});
