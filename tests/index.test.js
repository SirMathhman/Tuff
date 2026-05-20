const { main, compile } = require("../src/index.js");

function run(source, stdIn) {
  return new Function("stdIn", compile(source))(stdIn);
}

describe("main", () => {
  it("should log a greeting", () => {
    const spy = jest.spyOn(console, "log").mockImplementation(() => {});
    main();
    expect(spy).toHaveBeenCalledWith("Hello from Tuff!");
    spy.mockRestore();
  });
});

describe("run", () => {
  it('should return 0 for run("", "")', () => {
    expect(run("", "")).toBe(0);
  });

  it('should return 0 for run(" ", "")', () => {
    expect(run(" ", "")).toBe(0);
  });

  it('should return 100 for run("read<U8>()", "100")', () => {
    expect(run("read<U8>()", "100")).toBe(100);
  });

  it('should return 100 for run("read<U16>()", "100")', () => {
    expect(run("read<U16>()", "100")).toBe(100);
  });

  it('should return 100 for run("read<U32>()", "100")', () => {
    expect(run("read<U32>()", "100")).toBe(100);
  });

  it('should return 100 for run("read<U64>()", "100")', () => {
    expect(run("read<U64>()", "100")).toBe(100);
  });

  it('should return 100 for run("read<I8>()", "100")', () => {
    expect(run("read<I8>()", "100")).toBe(100);
  });

  it('should return 100 for run("read<I16>()", "100")', () => {
    expect(run("read<I16>()", "100")).toBe(100);
  });

  it('should return 100 for run("read<I32>()", "100")', () => {
    expect(run("read<I32>()", "100")).toBe(100);
  });

  it('should return 100 for run("read<I64>()", "100")', () => {
    expect(run("read<I64>()", "100")).toBe(100);
  });

  it('should return 3 for run("read<U8>() + read<U8>()", "1 2")', () => {
    expect(run("read<U8>() + read<U8>()", "1 2")).toBe(3);
  });

  it('should return 2 for run("let x : U8 = read<U8>(); x", "2")', () => {
    expect(run("let x : U8 = read<U8>(); x", "2")).toBe(2);
  });

  it('should return 4 for run("let x : U8 = read<U8>(); x + x", "2")', () => {
    expect(run("let x : U8 = read<U8>(); x + x", "2")).toBe(4);
  });

  it('should return 0 for run("let x : U8 = read<U8>();", "2")', () => {
    expect(run("let x : U8 = read<U8>();", "2")).toBe(0);
  });

  it('should return 2 for run("let x = read<U8>(); x", "2")', () => {
    expect(run("let x = read<U8>(); x", "2")).toBe(2);
  });

  it('should return 2 for run("let x = read<U8>(); let y = x; y", "2")', () => {
    expect(run("let x = read<U8>(); let y = x; y", "2")).toBe(2);
  });

  it('should return 2 for run("let mut x = read<U8>(); x = read<U8>(); x", "1 2")', () => {
    expect(run("let mut x = read<U8>(); x = read<U8>(); x", "1 2")).toBe(2);
  });
});

function expectError(source) {
  return expect(() => compile(source)).toThrow(Error);
}

describe("compile", () => {
  it('should throw for compile("read<U7>()")', () => {
    expectError("read<U7>()");
  });

  it('should throw for compile("read<F32>()")', () => {
    expectError("read<F32>()");
  });

  it('should throw for compile("let x : U8 = read<U16>();")', () => {
    expectError("let x : U8 = read<U16>();");
  });

  it('should throw for compile("let x = read<U8>(); x = read<U8>(); x")', () => {
    expectError("let x = read<U8>(); x = read<U8>(); x");
  });

  it('should throw for compile("let x = read<U8>(); let x = read<U8>();")', () => {
    expectError("let x = read<U8>(); let x = read<U8>();");
  });

  it('should throw for compile("let x = read<U16>(); let y : U8 = x;")', () => {
    expectError("let x = read<U16>(); let y : U8 = x;");
  });
});
