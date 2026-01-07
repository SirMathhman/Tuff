import * as runModule from "../src/run";

describe("compile", () => {
  test("returns JS code representing the length", () => {
    expect(runModule.compile("abc")).toBe("(3)");
    expect(runModule.compile("")).toBe("(0)");
  });

  test("handles unicode characters in compile", () => {
    expect(runModule.compile("💡")).toBe("(2)");
  });

  test("handles read<I32>() in compile", () => {
    expect(runModule.compile("read<I32>()")).toBe("readI32()");
    expect(runModule.compile("read<I32>() + read<I32>()")).toBe(
      "readI32() + readI32()"
    );
  });

  test("handles read<Bool>() in compile", () => {
    expect(runModule.compile("read<Bool>()")).toBe("readBool()");
    expect(runModule.compile("read<Bool>() + read<Bool>()")).toBe(
      "readBool() + readBool()"
    );
  });
});

describe("run", () => {
  test("returns length of a non-empty string", () => {
    expect(runModule.run("abc")).toBe(3);
  });

  test("returns 0 for empty string", () => {
    expect(runModule.run("")).toBe(0);
  });

  test("handles unicode characters", () => {
    expect(runModule.run("💡")).toBe(2);
    expect(runModule.run("hello💡")).toBe(7);
  });

  test("calls compile before eval", () => {
    const spy = jest.spyOn(runModule, "compile");
    try {
      expect(runModule.run("spy")).toBe(3);
      expect(spy).toHaveBeenCalledWith("spy");
    } finally {
      spy.mockRestore();
    }
  });
  test("accepts optional stdin parameter without changing behavior", () => {
    const spy = jest.spyOn(runModule, "compile");
    try {
      expect(runModule.run("abc", "some-stdin")).toBe(3);
      expect(spy).toHaveBeenCalledWith("abc");
    } finally {
      spy.mockRestore();
    }
  });

  test("read<I32>() reads from stdin", () => {
    expect(runModule.run("read<I32>()", "100")).toBe(100);
    expect(runModule.run("read<I32>() + read<I32>()", "1 2")).toBe(3);
    expect(runModule.run("read<I32>() + read<I32>()", "  1   2  ")).toBe(3);
  });

  test("read<Bool>() reads from stdin", () => {
    expect(runModule.run("read<Bool>()", "true")).toBe(1);
    expect(runModule.run("read<Bool>()", "false")).toBe(0);
    expect(runModule.run("read<Bool>() + read<Bool>()", "true false")).toBe(1);
    expect(runModule.run("read<Bool>() + read<Bool>()", "true true")).toBe(2);
  });

  test("assign read<Bool>() to variable and return", () => {
    const code = "let x : Bool = read<Bool>(); x";
    expect(runModule.run(code, "true")).toBe(1);
    expect(runModule.run(code, "false")).toBe(0);
  });

  test("assign read<I32>() to variable and return", () => {
    const code = "let x = read<I32>(); x";
    expect(runModule.run(code, "100")).toBe(100);
  });

  test("char literal assigned to variable returns char code", () => {
    const code = "let x : Char = 'a'; x";
    expect(runModule.run(code)).toBe(97);
  });

  test("boolean operators work with read<Bool>()", () => {
    expect(runModule.run("read<Bool>() && read<Bool>()", "true false")).toBe(0);
    expect(runModule.run("read<Bool>() && read<Bool>()", "true true")).toBe(1);
    expect(runModule.run("read<Bool>() || read<Bool>()", "true false")).toBe(1);
    expect(runModule.run("read<Bool>() || read<Bool>()", "false false")).toBe(
      0
    );
  });

  test("functions with yield work and read from stdin", () => {
    const code =
      "fn add(first : I32, second : I32) : I32 => { yield first + second; } add(read<I32>(), read<I32>())";
    expect(runModule.run(code, "3 4")).toBe(7);
  });

  test("type mismatch in function call throws", () => {
    const code =
      "fn add(first : I32, second : I32) : I32 => { yield first + second; } add(read<Bool>(), read<I32>())";
    // compile should report the type error
    expect(runModule.compile(code)).toMatch(/type mismatch/);
    expect(() => runModule.run(code, "true 2")).toThrow(/type mismatch/);
  });

  test("type mismatch with additional fn declaration throws", () => {
    const code =
      "fn add(first : I32, second : I32) : I32 => { yield first + second; } fn empty() : Void => {} add(read<Bool>(), read<I32>())";
    expect(runModule.compile(code)).toMatch(/type mismatch/);
    expect(() => runModule.run(code, "true 2")).toThrow(/type mismatch/);
  });
  test("handles multi-statement code with reads and returns value", () => {
    const code = "let x : I32 = read<I32>(); let y : I32 = read<I32>(); x + y";
    expect(runModule.run(code, "1 2")).toBe(3);
  });
  test("handles mutable declarations with mut", () => {
    const code = "let mut x : I32 = read<I32>(); x = read<I32>(); x";
    expect(runModule.run(code, "1 2")).toBe(2);
  });

  test("mut assignment inside function updates outer variable", () => {
    const code =
      "let mut x = 0; fn get() : Void => { x = read<I32>(); } get(); x";
    expect(runModule.run(code, "100")).toBe(100);
  });

  test("assignment to immutable variable throws", () => {
    const code = "let x : I32 = read<I32>(); x = read<I32>(); x";
    expect(() => runModule.run(code, "1 2")).toThrow(/immutable/);
  });

  test("duplicate variable declaration throws", () => {
    const code = "let x : I32 = 100; let x : I32 = 200;";
    expect(() => runModule.run(code)).toThrow(/duplicate/);
  });

  test("duplicate function declaration throws", () => {
    const code =
      "fn add(first : I32, second : I32) : I32 => { yield first + second; } fn add(first : I32, second : I32) : I32 => { yield first + second; }";
    expect(() => runModule.run(code)).toThrow(/duplicate function declaration/);
  });

  test("duplicate function parameter name throws", () => {
    const code =
      "fn add(first : I32, first : I32) : I32 => { yield first + second; }";
    expect(() => runModule.run(code)).toThrow(/duplicate parameter name/);
  });
});
