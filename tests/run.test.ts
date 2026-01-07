import * as runModule from "../src/run";

describe("compile", () => {
  test("returns JS code representing the length", () => {
    expect(runModule.compile("abc")).toBe("(3)");
    expect(runModule.compile("")).toBe("(0)");
  });

  test("handles unicode characters in compile", () => {
    expect(runModule.compile("💡")).toBe("(2)");
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
  test('accepts optional stdin parameter without changing behavior', () => {
    const spy = jest.spyOn(runModule, 'compile');
    try {
      expect(runModule.run('abc', 'some-stdin')).toBe(3);
      expect(spy).toHaveBeenCalledWith('abc');
    } finally {
      spy.mockRestore();
    }
  });});
