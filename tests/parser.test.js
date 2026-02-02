"use strict";

const { describe, it, expect } = require("bun:test");
const { lex } = require("../src/lex/lexer");
const { parse } = require("../src/parse/parser");

function parseSource(source) {
  const tokens = lex(source, "test.tuff");
  return parse(tokens, "test.tuff", source);
}

describe("Parser", () => {
  describe("Literals and identifiers", () => {
    it("parses number literals", () => {
      const ast = parseSource("5;");
      expect(ast.items.length).toBe(1);
      expect(ast.items[0].type).toBe("ExprStmt");
      expect(ast.items[0].expr.type).toBe("NumberLiteral");
      expect(ast.items[0].expr.value).toBe("5");
    });

    it("parses string literals", () => {
      const ast = parseSource('"hello";');
      expect(ast.items[0].expr.type).toBe("StringLiteral");
      expect(ast.items[0].expr.value).toBe("hello");
    });

    it("parses identifiers", () => {
      const ast = parseSource("x;");
      expect(ast.items[0].expr.type).toBe("Identifier");
      expect(ast.items[0].expr.name).toBe("x");
    });

    it("parses boolean literals", () => {
      const ast = parseSource("true; false;");
      expect(ast.items[0].expr.type).toBe("BooleanLiteral");
      expect(ast.items[0].expr.value).toBe(true);
      expect(ast.items[1].expr.type).toBe("BooleanLiteral");
      expect(ast.items[1].expr.value).toBe(false);
    });
  });

  describe("Binary expressions", () => {
    it("parses arithmetic operations", () => {
      const ast = parseSource("a + b;");
      expect(ast.items[0].expr.type).toBe("BinaryExpr");
      expect(ast.items[0].expr.op).toBe("+");
    });

    it("respects operator precedence", () => {
      const ast = parseSource("a + b * c;");
      const expr = ast.items[0].expr;
      expect(expr.type).toBe("BinaryExpr");
      expect(expr.op).toBe("+");
      expect(expr.right.type).toBe("BinaryExpr");
      expect(expr.right.op).toBe("*");
    });

    it("parses comparison operators", () => {
      const ast = parseSource("a == b;");
      expect(ast.items[0].expr.op).toBe("==");
    });

    it("parses logical operators", () => {
      const ast = parseSource("a && b || c;");
      const expr = ast.items[0].expr;
      expect(expr.type).toBe("BinaryExpr");
      expect(expr.op).toBe("||");
    });
  });

  describe("Unary expressions", () => {
    it("parses unary negation", () => {
      const ast = parseSource("-x;");
      expect(ast.items[0].expr.type).toBe("UnaryExpr");
      expect(ast.items[0].expr.op).toBe("-");
    });

    it("parses logical not", () => {
      const ast = parseSource("!x;");
      expect(ast.items[0].expr.type).toBe("UnaryExpr");
      expect(ast.items[0].expr.op).toBe("!");
    });
  });

  describe("Function calls", () => {
    it("parses function call with no arguments", () => {
      const ast = parseSource("foo();");
      expect(ast.items[0].expr.type).toBe("CallExpr");
      expect(ast.items[0].expr.callee.name).toBe("foo");
      expect(ast.items[0].expr.args.length).toBe(0);
    });

    it("parses function call with arguments", () => {
      const ast = parseSource("foo(a, b, c);");
      expect(ast.items[0].expr.type).toBe("CallExpr");
      expect(ast.items[0].expr.args.length).toBe(3);
    });

    it("parses nested function calls", () => {
      const ast = parseSource("foo(bar(x), baz());");
      const args = ast.items[0].expr.args;
      expect(args[0].type).toBe("CallExpr");
      expect(args[1].type).toBe("CallExpr");
    });
  });

  describe("Member access", () => {
    it("parses dot access", () => {
      const ast = parseSource("obj.field;");
      expect(ast.items[0].expr.type).toBe("MemberExpr");
      expect(ast.items[0].expr.property).toBe("field");
    });

    it("parses method calls via dot access", () => {
      const ast = parseSource("obj.method(arg);");
      expect(ast.items[0].expr.type).toBe("DotCall");
      expect(ast.items[0].expr.property).toBe("method");
    });

    it("parses chained member access", () => {
      const ast = parseSource("a.b.c;");
      const expr = ast.items[0].expr;
      expect(expr.type).toBe("MemberExpr");
      expect(expr.object.type).toBe("MemberExpr");
    });
  });

  describe("Array indexing", () => {
    it("parses array index access", () => {
      const ast = parseSource("arr[0];");
      expect(ast.items[0].expr.type).toBe("IndexExpr");
      expect(ast.items[0].expr.index.type).toBe("NumberLiteral");
    });

    it("parses nested indexing", () => {
      const ast = parseSource("arr[i][j];");
      const expr = ast.items[0].expr;
      expect(expr.type).toBe("IndexExpr");
      expect(expr.object.type).toBe("IndexExpr");
    });
  });

  describe("Array and struct literals", () => {
    it("parses empty array literal", () => {
      const ast = parseSource("[];");
      expect(ast.items[0].expr.type).toBe("ArrayLiteral");
      expect(ast.items[0].expr.elements.length).toBe(0);
    });

    it("parses array literal with elements", () => {
      const ast = parseSource("[1, 2, 3];");
      expect(ast.items[0].expr.elements.length).toBe(3);
    });

    it("parses array repeat literal", () => {
      const ast = parseSource("[42; 10];");
      expect(ast.items[0].expr.type).toBe("ArrayRepeat");
      expect(ast.items[0].expr.value.type).toBe("NumberLiteral");
    });

    it("parses struct literal", () => {
      const ast = parseSource("Point { 1, 2 };");
      expect(ast.items[0].expr.type).toBe("StructLiteral");
      expect(ast.items[0].expr.name).toBe("Point");
      expect(ast.items[0].expr.values.length).toBe(2);
    });
  });

  describe("Enum access", () => {
    it("parses enum variant access", () => {
      const ast = parseSource("Color::Red;");
      expect(ast.items[0].expr.type).toBe("EnumValue");
      expect(ast.items[0].expr.enumName).toBe("Color");
      expect(ast.items[0].expr.variant).toBe("Red");
    });
  });

  describe("Let statements", () => {
    it("parses let binding", () => {
      const ast = parseSource("let x = 5;");
      expect(ast.items[0].type).toBe("LetStmt");
      expect(ast.items[0].name).toBe("x");
      expect(ast.items[0].mutable).toBe(false);
    });

    it("parses mutable let binding", () => {
      const ast = parseSource("let mut x = 5;");
      expect(ast.items[0].type).toBe("LetStmt");
      expect(ast.items[0].mutable).toBe(true);
    });
  });

  describe("Assignment statements", () => {
    it("parses simple assignment", () => {
      const ast = parseSource("x = 5;");
      expect(ast.items[0].type).toBe("AssignStmt");
      expect(ast.items[0].target.type).toBe("Identifier");
    });

    it("parses compound assignment", () => {
      const ast = parseSource("x += 5;");
      expect(ast.items[0].type).toBe("AssignStmt");
      expect(ast.items[0].op).toBe("+=");
    });

    it("parses field assignment", () => {
      const ast = parseSource("obj.x = 5;");
      expect(ast.items[0].target.type).toBe("MemberExpr");
    });
  });

  describe("Control flow", () => {
    it("parses if expression", () => {
      const ast = parseSource("if (x > 0) { 5 } else { 10 };");
      expect(ast.items[0].expr.type).toBe("IfExpr");
      expect(ast.items[0].expr.condition).toBeDefined();
      expect(ast.items[0].expr.thenBranch).toBeDefined();
      expect(ast.items[0].expr.elseBranch).toBeDefined();
    });

    it("parses while loop", () => {
      const ast = parseSource("while (x > 0) { let y = x - 1; }");
      expect(ast.items[0].type).toBe("WhileStmt");
    });

    it("parses for loop", () => {
      const ast = parseSource("for (i in 0..10) { }");
      expect(ast.items[0].type).toBe("ForStmt");
    });

    it("parses break statement", () => {
      const ast = parseSource("while (true) { break; }");
      expect(ast.items[0].body.statements.length).toBeGreaterThan(0);
    });

    it("parses continue statement", () => {
      const ast = parseSource("while (true) { continue; }");
      expect(ast.items[0].body.statements.length).toBeGreaterThan(0);
    });
  });

  describe("Match expressions", () => {
    it("parses match with enum cases", () => {
      const ast = parseSource(
        "match (color) { case Color::Red => 0; case Color::Green => 1; };",
      );
      expect(ast.items[0].expr.type).toBe("MatchExpr");
      expect(ast.items[0].expr.cases.length).toBe(2);
    });

    it("parses match with wildcard", () => {
      const ast = parseSource("match (x) { case 1 => 5; case _ => 10; };");
      expect(ast.items[0].expr.cases.length).toBe(2);
    });

    it("parses match with scoped variants", () => {
      const ast = parseSource("match (val) { case Color::Red => 1; };");
      expect(ast.items[0].expr.cases[0].pattern.type).toBe("EnumPattern");
    });
  });

  describe("Function declarations", () => {
    it("parses function declaration", () => {
      const ast = parseSource("fn add(a, b) => a + b;");
      expect(ast.items[0].type).toBe("FnDecl");
      expect(ast.items[0].name).toBe("add");
      expect(ast.items[0].params.length).toBe(2);
    });

    it("parses function with return block", () => {
      const ast = parseSource("fn test() => { 42 };");
      expect(ast.items[0].name).toBe("test");
    });
  });

  describe("Struct declarations", () => {
    it("parses struct declaration", () => {
      const ast = parseSource("struct Point { x; y; }");
      expect(ast.items[0].type).toBe("StructDecl");
      expect(ast.items[0].name).toBe("Point");
      expect(ast.items[0].fields.length).toBe(2);
    });

    it("parses struct with mutable fields", () => {
      const ast = parseSource("struct State { mut value; }");
      expect(ast.items[0].fields[0].mutable).toBe(true);
    });
  });

  describe("Enum declarations", () => {
    it("parses enum declaration", () => {
      const ast = parseSource("enum Color { Red, Green, Blue }");
      expect(ast.items[0].type).toBe("EnumDecl");
      expect(ast.items[0].name).toBe("Color");
      expect(ast.items[0].variants.length).toBe(3);
    });
  });

  describe("Extern use declarations", () => {
    it("parses extern use", () => {
      const ast = parseSource("extern use { print, readFile } from io;");
      expect(ast.items[0].type).toBe("ExternUse");
      expect(ast.items[0].names.length).toBe(2);
      expect(ast.items[0].pkg).toBe("io");
    });
  });

  describe("Blocks", () => {
    it("parses block with multiple statements", () => {
      const ast = parseSource("{ let x = 5; let y = 10; x + y };");
      expect(ast.items[0].expr.type).toBe("BlockExpr");
      // 2 statements (let x, let y) + tail expression (x + y)
      expect(ast.items[0].expr.statements.length).toBe(2);
      expect(ast.items[0].expr.tail).toBeDefined();
    });

    it("parses nested blocks", () => {
      const ast = parseSource("{ { 5 } };");
      expect(ast.items[0].expr.type).toBe("BlockExpr");
      expect(ast.items[0].expr.tail.type).toBe("BlockExpr");
    });
  });

  describe("Complex programs", () => {
    it("parses function with control flow", () => {
      const source = `
        fn abs(x) => if (x < 0) { -x } else { x };
      `;
      const ast = parseSource(source);
      expect(ast.items[0].type).toBe("FnDecl");
    });

    it("parses multiple declarations", () => {
      const source = `
        fn add(a, b) => a + b;
        struct Point { x; y; }
        enum Color { Red, Green, Blue }
      `;
      const ast = parseSource(source);
      expect(ast.items.length).toBe(3);
    });
  });
});
