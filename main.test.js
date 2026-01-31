const { compile } = require("./main");

describe("compile", () => {
  it("should be a function", () => {
    expect(typeof compile).toBe("function");
  });

  it("should return the input unchanged (currently pass-through)", () => {
    const source = "const x = 5;";
    const result = compile(source);
    expect(result).toBe(source);
  });

  it("should handle empty strings", () => {
    const result = compile("");
    expect(result).toBe("");
  });

  it("should handle multi-line input", () => {
    const source = "const x = 5;\nconst y = 10;";
    const result = compile(source);
    expect(result).toBe(source);
  });

  it("should preserve whitespace and formatting", () => {
    const source = "  const x = 5;\n    console.log(x);";
    const result = compile(source);
    expect(result).toBe(source);
  });
});
