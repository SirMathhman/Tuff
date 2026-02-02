import { compile } from "../src";

function executeJS(jsCode: string, ...args: string[]): number {
  let exitCode = 0;
  const mockProcess = {
    argv: ["node", "script.js", ...args],
    exit: (code: number) => {
      exitCode = code;
      throw new Error(`exit:${code}`);
    },
  };

  try {
    const func = new Function("process", jsCode);
    func(mockProcess);
  } catch (e: unknown) {
    throw new Error(
      "Unexpected error '" + e + "' occurred during execution of: " + jsCode,
    );
  }

  return exitCode;
}

export function validate(source: string, exitCode: number, ...args: string[]) {
  const compiled = compile(source);
  const actualExitCode = executeJS(compiled, ...args);
  expect(actualExitCode).toBe(exitCode);
}

export function invalidate(source: string) {
  expect(() => compile(source)).toThrow();
}

describe("The compiler", () => {
  it("compiles an empty program", () => {
    validate("0", 0);
  });

  it("reads a U8 from stdin", () => {
    validate("read U8", 100, "100");
  });

  it("adds two U8 values", () => {
    validate("read U8 + read U8", 100, "25", "75");
  });

  it("adds three U8 values", () => {
    validate("read U8 + read U8 + read U8", 101, "25", "75", "1");
  });

  it("subtracts U8 values", () => {
    validate("read U8 + read U8 - read U8", 51, "25", "75", "49");
  });

  it("multiplies and subtracts U8 values", () => {
    validate("read U8 * read U8 - read U8", 20, "5", "6", "10");
  });

  it("respects operator precedence addition and multiplication", () => {
    validate("read U8 + read U8 * read U8", 25, "10", "5", "3");
  });

  it("divides two U8 values", () => {
    validate("read U8 / read U8", 20, "100", "5");
  });

  it("rejects division by zero at compile time", () => {
    invalidate("read U8 / 0");
  });

  it("respects parentheses in expressions", () => {
    validate("(read U8 + read U8) * read U8", 45, "10", "5", "3");
  });

  it("respects curly braces in expressions", () => {
    validate("(read U8 + { read U8 }) * read U8", 30, "10", "5", "2");
  });

  it("supports variable declarations with type annotations", () => {
    validate(
      "(read U8 + { let x : U8 = read U8; x }) * read U8",
      45,
      "10",
      "5",
      "3",
    );
  });

  it("supports top-level variable declarations", () => {
    validate(
      "let z : U8 = (read U8 + { let x : U8 = read U8; x }) * read U8; z",
      45,
      "10",
      "5",
      "3",
    );
  });

  it("supports variable declarations without type annotations", () => {
    validate("let x = read U8; x", 42, "42");
  });

  it("supports multiple variable declarations", () => {
    validate("let x = read U8; let y = read U8; x + y", 30, "10", "20");
  });

  it("supports nested variable declarations in blocks", () => {
    validate(
      "let x = { let y = read U8; let z = read U8; y + z}; x",
      30,
      "10",
      "20",
    );
  });

  it("rejects duplicate variable declarations at compile time", () => {
    invalidate("let x = 0; let x = 0; x");
  });

  it("rejects type mismatches at compile time", () => {
    invalidate("let x = read U16; let y : U8 = x; y");
  });

  it("rejects variable shadowing across scopes", () => {
    invalidate("let x = 0; let y = { let x = 0; x}; y");
  });

  it("supports mutable variables with reassignment", () => {
    validate("let mut x = 0; x = read I32; x", 100, "100");
  });

  it("rejects reassignment to different type", () => {
    invalidate("let x = 0; x = read I32; x");
  });

  it("supports variable declaration with type annotation and no initial value", () => {
    validate("let x : I32; x = read I32; x", 100, "100");
  });

  it("rejects using uninitialized variable without assignment", () => {
    invalidate("let x : I32; x");
  });

  it("rejects type mismatch on reassignment to uninitialized variable", () => {
    invalidate("let x : I32; x = read U8; x = 0; x");
  });

  it("supports mutable variable with nested block statement", () => {
    validate("let mut x = 10; { x = read U8; }; x", 42, "42");
  });
});
