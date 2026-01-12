/* eslint-disable max-lines-per-function, no-restricted-syntax */
import { tokenize } from "../src/interpreter/lexer";
import { parse, Parser } from "../src/interpreter/parser";
import type { ASTExpr, ASTProgram } from "../src/interpreter/astTypes";

// Helper to parse expression from string
function expr(source: string): ASTExpr {
  const tokens = tokenize(source);
  return new Parser(tokens).parseExpression();
}

// Helper to parse program from string
function prog(source: string): ASTProgram {
  const tokens = tokenize(source);
  return parse(tokens);
}

describe("Parser - literals", () => {
  it("parses number literal", () => {
    const ast = expr("42");
    expect(ast).toMatchObject({ kind: "number", value: 42 });
  });

  it("parses number with suffix", () => {
    const ast = expr("255U8");
    expect(ast).toMatchObject({ kind: "number", value: 255, suffix: "U8" });
  });

  it("parses boolean literals", () => {
    expect(expr("true")).toMatchObject({ kind: "boolean", value: true });
    expect(expr("false")).toMatchObject({ kind: "boolean", value: false });
  });

  it("parses identifier", () => {
    const ast = expr("foo");
    expect(ast).toMatchObject({ kind: "identifier", name: "foo" });
  });
});

describe("Parser - binary operators", () => {
  it("parses addition", () => {
    const ast = expr("1 + 2");
    expect(ast).toMatchObject({
      kind: "binary-op",
      op: "+",
      left: { kind: "number", value: 1 },
      right: { kind: "number", value: 2 },
    });
  });

  it("respects precedence: multiplication before addition", () => {
    const ast = expr("1 + 2 * 3");
    expect(ast).toMatchObject({
      kind: "binary-op",
      op: "+",
      left: { kind: "number", value: 1 },
      right: {
        kind: "binary-op",
        op: "*",
        left: { kind: "number", value: 2 },
        right: { kind: "number", value: 3 },
      },
    });
  });

  it("parses comparison operators", () => {
    const ast = expr("x < 10");
    expect(ast).toMatchObject({
      kind: "binary-op",
      op: "<",
      left: { kind: "identifier", name: "x" },
      right: { kind: "number", value: 10 },
    });
  });

  it("parses logical operators", () => {
    const ast = expr("a && b || c");
    expect(ast.kind).toBe("binary-op");
    expect((ast as { op: string }).op).toBe("||");
  });
});

describe("Parser - unary operators", () => {
  it("parses negation", () => {
    const ast = expr("!x");
    expect(ast).toMatchObject({
      kind: "unary-not",
      operand: { kind: "identifier", name: "x" },
    });
  });

  it("parses unary minus", () => {
    const ast = expr("-5");
    expect(ast).toMatchObject({
      kind: "unary-minus",
      operand: { kind: "number", value: 5 },
    });
  });

  it("parses dereference", () => {
    const ast = expr("*p");
    expect(ast).toMatchObject({
      kind: "deref",
      operand: { kind: "identifier", name: "p" },
    });
  });

  it("parses address-of", () => {
    const ast = expr("&x");
    expect(ast).toMatchObject({
      kind: "address-of",
      operand: { kind: "identifier", name: "x" },
      mutable: false,
    });
  });

  it("parses mutable address-of", () => {
    const ast = expr("&mut x");
    expect(ast).toMatchObject({
      kind: "address-of",
      operand: { kind: "identifier", name: "x" },
      mutable: true,
    });
  });
});

describe("Parser - postfix operators", () => {
  it("parses field access", () => {
    const ast = expr("point.x");
    expect(ast).toMatchObject({
      kind: "field-access",
      object: { kind: "identifier", name: "point" },
      field: "x",
    });
  });

  it("parses method call", () => {
    const ast = expr("point.manhattan()");
    expect(ast).toMatchObject({
      kind: "method-call",
      receiver: { kind: "identifier", name: "point" },
      method: "manhattan",
      args: [],
    });
  });

  it("parses array indexing", () => {
    const ast = expr("arr[0]");
    expect(ast).toMatchObject({
      kind: "index",
      target: { kind: "identifier", name: "arr" },
      index: { kind: "number", value: 0 },
    });
  });

  it("parses function call", () => {
    const ast = expr("add(1, 2)");
    expect(ast).toMatchObject({
      kind: "call",
      func: { kind: "identifier", name: "add" },
      args: [
        { kind: "number", value: 1 },
        { kind: "number", value: 2 },
      ],
    });
  });

  it("parses chained postfix", () => {
    const ast = expr("arr[0].field");
    expect(ast).toMatchObject({
      kind: "field-access",
      object: {
        kind: "index",
        target: { kind: "identifier", name: "arr" },
      },
      field: "field",
    });
  });
});

describe("Parser - complex expressions", () => {
  it("parses array literal", () => {
    const ast = expr("[1, 2, 3]");
    expect(ast).toMatchObject({
      kind: "array-literal",
      elements: [
        { kind: "number", value: 1 },
        { kind: "number", value: 2 },
        { kind: "number", value: 3 },
      ],
    });
  });

  it("parses if expression", () => {
    const ast = expr("if (x < 10) 1 else 2");
    expect(ast).toMatchObject({
      kind: "if-expr",
      condition: { kind: "binary-op", op: "<" },
      thenBranch: { kind: "number", value: 1 },
      elseBranch: { kind: "number", value: 2 },
    });
  });

  it("parses this keyword", () => {
    expect(expr("this")).toMatchObject({ kind: "this" });
  });

  it("parses this.field", () => {
    const ast = expr("this.x");
    expect(ast).toMatchObject({ kind: "this-field", field: "x" });
  });

  it("parses grouped expression", () => {
    const ast = expr("(1 + 2) * 3");
    expect(ast).toMatchObject({
      kind: "binary-op",
      op: "*",
      left: { kind: "binary-op", op: "+" },
      right: { kind: "number", value: 3 },
    });
  });
});

describe("Parser - statements", () => {
  it("parses let statement", () => {
    const program = prog("let x = 5;");
    expect(program.statements).toHaveLength(1);
    expect(program.statements[0]).toMatchObject({
      kind: "let-stmt",
      name: "x",
      mutable: false,
      initializer: { kind: "number", value: 5 },
    });
  });

  it("parses let mut statement", () => {
    const program = prog("let mut x : I32 = 0;");
    expect(program.statements[0]).toMatchObject({
      kind: "let-stmt",
      name: "x",
      mutable: true,
      typeAnnotation: { kind: "type-ident", name: "I32" },
    });
  });

  it("parses fn statement", () => {
    const program = prog("fn add(a: I32, b: I32) => a + b");
    expect(program.statements[0]).toMatchObject({
      kind: "fn-stmt",
      name: "add",
      params: [
        { name: "a", typeAnnotation: { kind: "type-ident", name: "I32" } },
        { name: "b", typeAnnotation: { kind: "type-ident", name: "I32" } },
      ],
      body: { kind: "binary-op", op: "+" },
    });
  });

  it("parses struct statement", () => {
    const program = prog("struct Point { x: I32, y: I32 }");
    expect(program.statements[0]).toMatchObject({
      kind: "struct-stmt",
      name: "Point",
      fields: [
        { name: "x", typeAnnotation: { kind: "type-ident", name: "I32" } },
        { name: "y", typeAnnotation: { kind: "type-ident", name: "I32" } },
      ],
    });
  });

  it("parses type statement with destructor", () => {
    const program = prog("type L = I32 then drop;");
    expect(program.statements[0]).toMatchObject({
      kind: "type-stmt",
      name: "L",
      aliasOf: { kind: "type-ident", name: "I32" },
      destructor: "drop",
    });
  });

  it("parses assignment statement", () => {
    const program = prog("x = 10;");
    expect(program.statements[0]).toMatchObject({
      kind: "assign-stmt",
      target: { kind: "identifier", name: "x" },
      value: { kind: "number", value: 10 },
    });
  });

  it("parses compound assignment", () => {
    const program = prog("x += 5;");
    expect(program.statements[0]).toMatchObject({
      kind: "compound-assign-stmt",
      target: { kind: "identifier", name: "x" },
      op: "+=",
    });
  });

  it("parses return statement", () => {
    const program = prog("return 42;");
    expect(program.statements[0]).toMatchObject({
      kind: "return-stmt",
      value: { kind: "number", value: 42 },
    });
  });

  it("parses while statement", () => {
    const program = prog("while (x < 10) x = x + 1;");
    expect(program.statements[0]).toMatchObject({
      kind: "while-stmt",
      condition: { kind: "binary-op", op: "<" },
    });
  });

  it("parses for statement", () => {
    const program = prog("for (let i in 0..10) sum = sum + i;");
    expect(program.statements[0]).toMatchObject({
      kind: "for-stmt",
      varName: "i",
      start: { kind: "number", value: 0 },
      end: { kind: "number", value: 10 },
    });
  });
});

describe("Parser - type expressions", () => {
  it("parses simple type", () => {
    const program = prog("let x : I32 = 0;");
    const stmt = program.statements[0] as { kind: string; typeAnnotation: object };
    expect(stmt.typeAnnotation).toMatchObject({ kind: "type-ident", name: "I32" });
  });

  it("parses pointer type", () => {
    const program = prog("let p : *I32 = &x;");
    const stmt = program.statements[0] as { kind: string; typeAnnotation: object };
    expect(stmt.typeAnnotation).toMatchObject({
      kind: "type-pointer",
      mutable: false,
      pointee: { kind: "type-ident", name: "I32" },
    });
  });

  it("parses mutable pointer type", () => {
    const program = prog("let p : *mut I32 = &mut x;");
    const stmt = program.statements[0] as { kind: string; typeAnnotation: object };
    expect(stmt.typeAnnotation).toMatchObject({
      kind: "type-pointer",
      mutable: true,
    });
  });

  it("parses array type", () => {
    const program = prog("let arr : [I32; 0; 10] = [1, 2, 3];");
    const stmt = program.statements[0] as { kind: string; typeAnnotation: object };
    expect(stmt.typeAnnotation).toMatchObject({
      kind: "type-array",
      elementType: { kind: "type-ident", name: "I32" },
      init: 0,
      length: 10,
    });
  });

  it("parses function type", () => {
    const program = prog("let f : (I32, I32) => I32 = add;");
    const stmt = program.statements[0] as { kind: string; typeAnnotation: object };
    expect(stmt.typeAnnotation).toMatchObject({
      kind: "type-function",
      params: [
        { kind: "type-ident", name: "I32" },
        { kind: "type-ident", name: "I32" },
      ],
      returnType: { kind: "type-ident", name: "I32" },
    });
  });

  it("parses generic type", () => {
    const program = prog("let t : Tuple<I32, Bool> = { 1, true };");
    const stmt = program.statements[0] as { kind: string; typeAnnotation: object };
    expect(stmt.typeAnnotation).toMatchObject({
      kind: "type-generic",
      baseName: "Tuple",
      typeArgs: [
        { kind: "type-ident", name: "I32" },
        { kind: "type-ident", name: "Bool" },
      ],
    });
  });
});

describe("Parser - block expressions", () => {
  it("parses block with statements and final expression", () => {
    const ast = expr("{ let x = 1; x + 1 }");
    expect(ast.kind).toBe("block-expr");
  });

  it("parses nested blocks", () => {
    const ast = expr("{ { 1 } }");
    expect(ast.kind).toBe("block-expr");
  });
});

describe("Parser - match expressions", () => {
  it("parses match with multiple arms", () => {
    const ast = expr("match (x) { case 1 => 10; case _ => 0; }");
    expect(ast).toMatchObject({
      kind: "match-expr",
      subject: { kind: "identifier", name: "x" },
    });
    expect((ast as { arms: unknown[] }).arms).toHaveLength(2);
  });
});

describe("Parser - lambda expressions", () => {
  it("parses fn expression", () => {
    const ast = expr("fn(a: I32, b: I32) => a + b");
    expect(ast).toMatchObject({
      kind: "lambda",
      params: [
        { name: "a" },
        { name: "b" },
      ],
    });
  });

  it("parses arrow function", () => {
    const ast = expr("(x: I32) => x + 1");
    expect(ast).toMatchObject({
      kind: "lambda",
      params: [{ name: "x" }],
    });
  });
});
