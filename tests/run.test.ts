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
  test("handles multi-statement code with reads and returns value", () => {
    const code = "let x : I32 = read<I32>(); let y : I32 = read<I32>(); x + y";
    expect(runModule.run(code, "1 2")).toBe(3);
  });
  test('handles mutable declarations with mut', () => {
    const code = 'let mut x : I32 = read<I32>(); x = read<I32>(); x';
    expect(runModule.run(code, '1 2')).toBe(2);
  });});
