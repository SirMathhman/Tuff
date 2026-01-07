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

describe("run - basics", () => {
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
});

describe("run - reads", () => {
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
});

describe("run - strings and chars", () => {
  test("char literal assigned to variable returns char code", () => {
    const code = "let x : Char = 'a'; x";
    expect(runModule.run(code)).toBe(97);
  });

  test("string indexing of variable returns char code", () => {
    const code = `let x : &Str = "a"; x[0]`;
    expect(runModule.run(code)).toBe(97);
  });

  test("string literal indexing returns char code", () => {
    const code = `"a"[0]`;
    expect(runModule.run(code)).toBe(97);
  });

  test("string indexing assigned to Char returns char code", () => {
    const code = `let x : &Str = "a"; let y : Char = x[0]; y`;
    expect(runModule.run(code)).toBe(97);
  });
});

describe("run - control flow", () => {
  test("if expression with reads returns correct branch", () => {
    const code = "if (read<Bool>()) 3 else 5";
    expect(runModule.run(code, "true")).toBe(3);
    expect(runModule.run(code, "false")).toBe(5);
  });

  test("if expression with literal condition works", () => {
    const code = "if (true) 3 else 5";
    expect(runModule.run(code)).toBe(3);
    const code2 = "if (false) 3 else 5";
    expect(runModule.run(code2)).toBe(5);
  });

  test("if expression assigned to variable returns correct branch", () => {
    const code = "let x = if (read<Bool>()) 3 else 5; x";
    expect(runModule.run(code, "true")).toBe(3);
    expect(runModule.run(code, "false")).toBe(5);
  });

  test("declaration without initializer can be assigned later", () => {
    const code = "let x : I32; x = read<I32>(); x";
    expect(runModule.run(code, "100")).toBe(100);
  });

  test("compound assignment (+=) on mutable variable works", () => {
    const code = "let mut x = 0; x += read<I32>(); x";
    expect(runModule.run(code, "100")).toBe(100);
  });

  test("compound assignment on immutable variable throws", () => {
    const code = "let x = 0; x += read<I32>(); x";
    expect(() => runModule.run(code, "100")).toThrow(/immutable/);
  });

  test("while loop with single-statement body increments variable", () => {
    const code = "let mut x = 0; while (x < 3) x = x + 1; x";
    expect(runModule.run(code)).toBe(3);
  });

  test("while loop with read in condition works", () => {
    // this uses read<I32>() as a limit
    const code =
      "let mut i = 0; let n = read<I32>(); while (i < n) i = i + 1; i";
    expect(runModule.run(code, "100")).toBe(100);
  });

  test("recursive factorial using yield and blocks works", () => {
    const code = `fn fact(n : I32) : I32 => { if (n == 0) { yield 1; } yield n * fact(n - 1); } fact(read<I32>())`;
    const compiled = runModule.compile(code);
    console.log("COMPILED_FACT:", compiled);
    expect(runModule.run(code, "5")).toBe(120);
  });

  test("recursive sum without stdin works", () => {
    const code = `fn sum(n : I32) : I32 => { if (n == 0) { yield 0; } yield n + sum(n - 1); } sum(3)`;
    expect(runModule.run(code)).toBe(6);
  });
});

describe("run - arrays", () => {
  test("array indexing works and sums values", () => {
    const code = "let x : [I32; 3; 3] = [1, 2, 3]; x[0] + x[1] + x[2]";
    expect(runModule.run(code)).toBe(6);
  });

  test("array indexing with size 2 works", () => {
    const code = "let x : [I32; 2; 2] = [1, 2]; x[0] + x[1]";
    expect(runModule.run(code)).toBe(3);
  });

  test("array initializer length mismatch throws", () => {
    const code = "let x : [I32; 1; 2] = [1, 2];";
    expect(runModule.compile(code)).toMatch(
      /array initializer length mismatch/
    );
    expect(() => runModule.run(code)).toThrow(
      /array initializer length mismatch/
    );
  });

  test("partially initialized array pads with defaults to runtime size", () => {
    const code = "let x : [I32; 1; 2] = [1]; x[0] + x[1]";
    // x[1] should be default-initialized to 0
    const compiled = runModule.compile(code);
    expect(compiled).toMatch(/\[1,\s*0\]/);
    expect(runModule.run(code)).toBe(1);
  });

  test("array declaration without initializer can be assigned by index and sums values", () => {
    const code =
      "let mut x : [I32; 0; 2]; x[0] = read<I32>(); x[1] = read<I32>(); x[0] + x[1]";
    const compiled = runModule.compile(code);
    // ensure declaration was initialized
    expect(compiled).toMatch(/let\s+x\s*=\s*\[/);
    expect(runModule.run(code, "3 4")).toBe(7);
  });
});

describe("run - pointers", () => {
  test("pointer deref returns value", () => {
    const code = "let x = 100; let y : *I32 = &x; *y";
    expect(runModule.run(code)).toBe(100);
  });

  test("pointer assignment updates pointee", () => {
    const code = "let x = 100; let y : *I32 = &x; *y = 200; x";
    expect(runModule.run(code)).toBe(200);
  });

  test("mutable pointer via &mut and *mut type", () => {
    const code =
      "let mut x = 0; let y : *mut I32 = &mut x; *y = read<I32>(); x";
    expect(runModule.run(code, "100")).toBe(100);
  });
});

describe("run - boolean operators", () => {
  test("boolean operators work with read<Bool>()", () => {
    const code1 = "read<Bool>() && read<Bool>()";
    expect(runModule.run(code1, "true false")).toBe(0);
    expect(runModule.run(code1, "true true")).toBe(1);
    const code2 = "read<Bool>() || read<Bool>()";
    expect(runModule.run(code2, "true false")).toBe(1);
    expect(runModule.run(code2, "false false")).toBe(0);
  });
});

describe("run - functions", () => {
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
});

describe("run - statements and mutability", () => {
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
});

describe("run - duplicates", () => {
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
