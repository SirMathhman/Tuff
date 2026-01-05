import { jest } from "@jest/globals";
import { Parser } from "../../main/ts/parser/parser.js";
import { Lexer } from "../../main/ts/lexer/lexer.js";
import { DiagnosticReporter } from "../../main/ts/common/diagnostics.js";
import {
  ExpressionStmt,
  FnDecl,
  LetDecl,
  TypeAliasDecl,
} from "../../main/ts/ast/ast.js";

describe("Parser", () => {
  let reporter: DiagnosticReporter;

  const parseProgram = (source: string) => {
    const lexer = new Lexer(source, "test.tuff", reporter);
    const tokens = lexer.scanTokens();
    const parser = new Parser(tokens, "test.tuff", reporter);
    return parser.parse();
  };

  beforeEach(() => {
    reporter = new DiagnosticReporter();
    jest.spyOn(reporter, "report");
  });

  it("should parse basic declarations", () => {
    const source = `
      from System::IO use { println };
      out let x: I32 = 10;
      fn add(a: I32, b: I32): I32 => a + b;
      struct Point { x: I32, y: I32 }
      impl Point {
        fn new(x: I32, y: I32): Point => {
          yield Point { x, y };
        }
      }
      type MyInt = I32;
    `;
    const program = parseProgram(source);

    expect(reporter.report).not.toHaveBeenCalled();
    expect(program.statements.length).toBe(6);
    expect(program.statements[0].kind).toBe("ImportDecl");
    expect(program.statements[1].kind).toBe("LetDecl");
    expect(program.statements[2].kind).toBe("FnDecl");
    expect(program.statements[3].kind).toBe("StructDecl");
    expect(program.statements[4].kind).toBe("ImplDecl");
    expect(program.statements[5].kind).toBe("TypeAliasDecl");
  });

  it("should parse extern declarations", () => {
    const source = `
      extern fn native_func(a: I32): Void;
      extern intrinsic type NativeString;
    `;
    const program = parseProgram(source);

    expect(reporter.report).not.toHaveBeenCalled();
    expect(program.statements.length).toBe(2);

    const fnDecl = program.statements[0] as FnDecl;
    expect(fnDecl.kind).toBe("FnDecl");
    expect(fnDecl.modifiers.some((m) => m.modifier === "extern")).toBe(true);
    expect(fnDecl.body).toBeUndefined();

    const typeDecl = program.statements[1] as TypeAliasDecl;
    expect(typeDecl.kind).toBe("TypeAliasDecl");
    expect(typeDecl.modifiers.some((m) => m.modifier === "extern")).toBe(true);
    expect(typeDecl.modifiers.some((m) => m.modifier === "intrinsic")).toBe(
      true
    );
    expect(typeDecl.type).toBeUndefined();
  });

  it("should parse complex types", () => {
    const source = `
      let a: [I32; 0; 10] = [1, 2, 3];
      let b: *[I32] = a[0..2];
      let c: *mut [I32] = a[0..2];
      let d: I32 | Bool = true;
    `;
    const program = parseProgram(source);

    expect(reporter.report).not.toHaveBeenCalled();
    expect(program.statements.length).toBe(4);

    const a = program.statements[0] as LetDecl;
    const b = program.statements[1] as LetDecl;
    const c = program.statements[2] as LetDecl;
    const d = program.statements[3] as LetDecl;

    expect(a.type?.kind).toBe("ArrayType");
    expect(b.type?.kind).toBe("SliceType");
    expect(c.type?.kind).toBe("SliceType");
    expect(
      c.type && c.type.kind === "SliceType" ? c.type.modifiers.length : 0
    ).toBe(1);
    expect(d.type?.kind).toBe("UnionType");
  });

  it("should parse control flow expressions", () => {
    const source = `
      let x = if (true) { yield 1; } else { yield 0; };
      while (true) {
        println("loop");
      }
    `;
    const program = parseProgram(source);

    expect(reporter.report).not.toHaveBeenCalled();
    expect(program.statements.length).toBe(2);
    const letStmt = program.statements[0] as LetDecl;
    const whileStmt = program.statements[1] as ExpressionStmt;
    expect(letStmt.initializer.kind).toBe("IfExpr");
    expect(whileStmt.expression.kind).toBe("WhileExpr");
  });
});
