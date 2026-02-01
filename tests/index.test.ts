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
  } catch (e: any) {
    if (typeof e.message === "string" && e.message.startsWith("exit:")) {
      exitCode = parseInt(e.message.substring(5), 10);
    } else {
      throw e;
    }
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
});
