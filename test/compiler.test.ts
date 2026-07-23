import { describe, expect, it, spyOn } from "bun:test";
import * as fs from "fs";
import { compile, runCli } from "../src/compiler";

describe("Variables", () => {
  it("compiles empty program", () => {
    const output = compile("");
    expect(output).toBeDefined();
  });

  it("compiles let binding with literal", () => {
    const output = compile("let x = 42;");
    expect(output).toContain("x");
  });

  it("compiles multiple let bindings", () => {
    const output = compile("let a = 1; let b = 2;");
    expect(output).toContain("a");
    expect(output).toContain("b");
  });
});

describe("Arithmetic", () => {
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
});

describe("Comparison", () => {
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
});

describe("Conditionals", () => {
  it("compiles if expression", () => {
    const output = compile("if (x > 0) { let y = 1; }");
    expect(output).toContain("if");
  });

  it("compiles if/else expression", () => {
    const output = compile(
      "if (x > 0) { let y = 1; } else { let y = 2; }",
    );
    expect(output).toContain("if");
    expect(output).toContain("else");
  });

  it("compiles nested if", () => {
    const output = compile("if (a > 0) { if (b > 0) { let c = 1; } }");
    expect(output).toContain("if");
  });
});

describe("Loops", () => {
  it("compiles while loop", () => {
    const output = compile("while (x > 0) { let y = x - 1; }");
    expect(output).toContain("while");
  });
});

describe("Arrays", () => {
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
});

describe("Objects", () => {
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
});

describe("Functions", () => {
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
});

describe("Integration", () => {
  it("compiles a complete program", () => {
    const source =
      "fn add(a, b) => a + b;\n" +
      "let x = 10;\n" +
      "let y = 20;\n" +
      "let sum = add(x, y);\n" +
      'if (sum > 15) { let msg = "big"; } else { let msg = "small"; }\n' +
      "let arr = [1, 2, 3];\n" +
      "let first = arr[0];\n" +
      "while (first > 0) { let zero = 0; }\n";
    const output = compile(source);
    expect(output).toBeDefined();
    expect(output.length).toBeGreaterThan(0);
  });
});

describe("Errors", () => {
  it("rejects missing semicolon on let", () => {
    expect(() => compile("let x = 42")).toThrow();
  });

  it("rejects unclosed brace", () => {
    expect(() => compile("if (x) { let y = 1;")).toThrow();
  });

  it("rejects unclosed bracket", () => {
    expect(() => compile("let arr = [1, 2, 3;")).toThrow();
  });

  it("rejects unterminated string", () => {
    expect(() => compile('let x = "abc;')).toThrow("Unterminated string");
  });

  it("rejects unexpected character", () => {
    expect(() => compile("let x = @;")).toThrow("Unexpected character");
  });

  it("rejects unexpected token", () => {
    expect(() => compile("else { let x = 1; }")).toThrow("Unexpected token");
  });

  it("rejects function missing body", () => {
    expect(() => compile("fn foo() 42;")).toThrow(
      "Expected '=>' or '{' for function body",
    );
  });
});

describe("Comments", () => {
  it("compiles source with a line comment", () => {
    const output = compile("// a comment\nlet x = 1;");
    expect(output).toContain("x");
  });

  it("compiles source with a trailing line comment", () => {
    const output = compile("let x = 1; // trailing");
    expect(output).toContain("x");
  });

  it("compiles source with a block comment", () => {
    const output = compile("/* a\nmulti-line\ncomment */ let x = 1;");
    expect(output).toContain("x");
  });
});

describe("Strings", () => {
  it("compiles a string with an escaped character", () => {
    const output = compile('let x = "a\\"b";');
    expect(output).toContain("x");
  });
});

describe("Unary", () => {
  it("compiles negation", () => {
    const output = compile("let x = -a;");
    expect(output).toContain("-a");
  });

  it("compiles logical not", () => {
    const output = compile("let x = !a;");
    expect(output).toContain("!a");
  });
});

describe("Booleans", () => {
  it("compiles a boolean literal", () => {
    const output = compile("let x = true;");
    expect(output).toContain("true");
  });
});

describe("Grouping", () => {
  it("compiles a parenthesized expression", () => {
    const output = compile("let x = (1 + 2) * 3;");
    expect(output).toContain("+");
    expect(output).toContain("*");
  });
});

describe("Type annotations", () => {
  it("compiles a let with a type annotation", () => {
    const output = compile("let x: number = 42;");
    expect(output).toContain("x");
  });

  it("compiles a function with typed params", () => {
    const output = compile("fn add(a: number, b: number) => a + b;");
    expect(output).toContain("add");
  });
});

describe("CLI", () => {
  it("prints usage and exits 1 when no input file is given", () => {
    const exitSpy = spyOn(process, "exit").mockImplementation(
      (() => undefined) as never,
    );
    const errorSpy = spyOn(console, "error").mockImplementation(() => {});

    runCli(["bun", "tuff"]);

    expect(errorSpy).toHaveBeenCalledWith("Usage: tuff compile <input.tuff>");
    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("compiles and prints the given file", () => {
    const readSpy = spyOn(fs, "readFileSync").mockReturnValue(
      "let x = 1;",
    );
    const logSpy = spyOn(console, "log").mockImplementation(() => {});

    runCli(["bun", "tuff", "input.tuff"]);

    expect(readSpy).toHaveBeenCalledWith("input.tuff", "utf-8");
    expect(logSpy).toHaveBeenCalled();

    readSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("prints an error and exits 1 when compilation fails", () => {
    const readSpy = spyOn(fs, "readFileSync").mockReturnValue("let x = 42");
    const exitSpy = spyOn(process, "exit").mockImplementation(
      (() => undefined) as never,
    );
    const errorSpy = spyOn(console, "error").mockImplementation(() => {});

    runCli(["bun", "tuff", "input.tuff"]);

    expect(errorSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);

    readSpy.mockRestore();
    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
