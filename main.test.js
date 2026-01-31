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

  it("should transform extern use to const require syntax", () => {
    const source = "extern use fs from fs;";
    const result = compile(source);
    expect(result).toBe('const fs = require("fs");');
  });

  it("should handle multiple extern use statements", () => {
    const source = "extern use fs from fs;\nextern use path from path;";
    const result = compile(source);
    expect(result).toBe(
      'const fs = require("fs");\nconst path = require("path");',
    );
  });
});
