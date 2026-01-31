const { compileTuffToJS } = require("./main");

describe("compileTuffToJS", () => {
  it("should be a function", () => {
    expect(typeof compileTuffToJS).toBe("function");
  });

  it("should return the input unchanged (currently pass-through)", () => {
    const source = "const x = 5;";
    const result = compileTuffToJS(source);
    expect(result).toBe(source);
  });

  it("should handle empty strings", () => {
    const result = compileTuffToJS("");
    expect(result).toBe("");
  });

  it("should handle multi-line input", () => {
    const source = "const x = 5;\nconst y = 10;";
    const result = compileTuffToJS(source);
    expect(result).toBe(source);
  });

  it("should preserve whitespace and formatting", () => {
    const source = "  const x = 5;\n    console.log(x);";
    const result = compileTuffToJS(source);
    expect(result).toBe(source);
  });

  it("should transform extern use to const require syntax", () => {
    const source = "extern use fs from fs;";
    const result = compileTuffToJS(source);
    expect(result).toBe('const fs = require("fs");');
  });

  it("should handle multiple extern use statements", () => {
    const source = "extern use fs from fs;\nextern use path from path;";
    const result = compileTuffToJS(source);
    expect(result).toBe(
      'const fs = require("fs");\nconst path = require("path");',
    );
  });

  it("should transform fn to function keyword", () => {
    const source = "fn myFunc() { return 42; }";
    const result = compileTuffToJS(source);
    expect(result).toBe("function myFunc() { return 42; }");
  });

  it("should handle fn with parameters", () => {
    const source = "fn add(a, b) { return a + b; }";
    const result = compileTuffToJS(source);
    expect(result).toBe("function add(a, b) { return a + b; }");
  });

  it("should remove => arrow from function definitions", () => {
    const source = "fn myFunc() => { return 42; }";
    const result = compileTuffToJS(source);
    expect(result).toBe("function myFunc() { return 42; }");
  });

  it("should handle fn with arrow and parameters", () => {
    const source = "fn add(a, b) => { return a + b; }";
    const result = compileTuffToJS(source);
    expect(result).toBe("function add(a, b) { return a + b; }");
  });

  it("should remove type annotations from function parameters", () => {
    const source = "fn compileTuffToJS(source : String) => { return source; }";
    const result = compileTuffToJS(source);
    expect(result).toBe("function compileTuffToJS(source) { return source; }");
  });

  it("should handle multiple parameters with type annotations", () => {
    const source = "fn add(a : Number, b : Number) => { return a + b; }";
    const result = compileTuffToJS(source);
    expect(result).toBe("function add(a, b) { return a + b; }");
  });

  it("should remove return type annotations from functions", () => {
    const source = 'fn getValue() : String => { return "hello"; }';
    const result = compileTuffToJS(source);
    expect(result).toBe('function getValue() { return "hello"; }');
  });

  it("should handle functions with parameters and return types", () => {
    const source =
      "fn add(a : Number, b : Number) : Number => { return a + b; }";
    const result = compileTuffToJS(source);
    expect(result).toBe("function add(a, b) { return a + b; }");
  });

  it("should transform Rust-like for loops to JavaScript", () => {
    const source = "for (let i in 0..5) { }";
    const result = compileTuffToJS(source);
    expect(result).toBe("for (let i = 0; i < 5; i = i + 1) { }");
  });

  it("should handle for loops with variables", () => {
    const source = "for (let i in 0..lines.length) { }";
    const result = compileTuffToJS(source);
    expect(result).toBe("for (let i = 0; i < lines.length; i = i + 1) { }");
  });

  it("should handle multiple for loops", () => {
    const source = "for (let i in 0..10) { }\nfor (let j in 0..20) { }";
    const result = compileTuffToJS(source);
    expect(result).toBe(
      "for (let i = 0; i < 10; i = i + 1) { }\nfor (let j = 0; j < 20; j = j + 1) { }",
    );
  });

  it("should remove mut keyword from let declarations", () => {
    const source = "let mut x = 5;";
    const result = compileTuffToJS(source);
    expect(result).toBe("let x = 5;");
  });

  it("should handle multiple mut declarations", () => {
    const source = "let mut x = 5;\nlet mut y = 10;";
    const result = compileTuffToJS(source);
    expect(result).toBe("let x = 5;\nlet y = 10;");
  });

  it("should preserve non-mut let declarations", () => {
    const source = "let x = 5;";
    const result = compileTuffToJS(source);
    expect(result).toBe("let x = 5;");
  });

  it("should error if immutable variable is reassigned", () => {
    const source = "let x = 5;\nx = 10;";
    expect(() => compileTuffToJS(source)).toThrow();
  });

  it("should allow reassignment of mut variables", () => {
    const source = "let mut x = 5;\nx = 10;";
    const result = compileTuffToJS(source);
    expect(result).toBe("let x = 5;\nx = 10;");
  });

  it("should error on multiple reassignments without mut", () => {
    const source = "let x = 5;\nx = 10;\nx = 15;";
    expect(() => compileTuffToJS(source)).toThrow();
  });

  it("should remove type annotations from let declarations", () => {
    const source = "let x : Number = 5;";
    const result = compileTuffToJS(source);
    expect(result).toBe("let x = 5;");
  });

  it("should remove type annotations from mutable let declarations", () => {
    const source = 'let mut y : String = "hello";';
    const result = compileTuffToJS(source);
    expect(result).toBe('let y = "hello";');
  });

  it("should handle multiple local declarations with types", () => {
    const source = 'let x : Number = 5;\nlet y : String = "test";';
    const result = compileTuffToJS(source);
    expect(result).toBe('let x = 5;\nlet y = "test";');
  });

  it("should remove type alias declarations", () => {
    const source = "type MyString = String;";
    const result = compileTuffToJS(source);
    expect(result).toBe("");
  });

  it("should handle multiple type aliases", () => {
    const source = "type MyString = String;\ntype MyNumber = Number;";
    const result = compileTuffToJS(source);
    expect(result).toBe("\n");
  });

  it("should preserve code around type aliases", () => {
    const source = "let x = 5;\ntype MyString = String;\nlet y = 10;";
    const result = compileTuffToJS(source);
    expect(result).toBe("let x = 5;\n\nlet y = 10;");
  });

  it("should remove type disjunctions in type aliases", () => {
    const source = "type Status = String | Number;";
    const result = compileTuffToJS(source);
    expect(result).toBe("");
  });

  it("should handle multiple disjunctions in union types", () => {
    const source = "type Value = String | Number | Boolean;";
    const result = compileTuffToJS(source);
    expect(result).toBe("");
  });

  it("should preserve code around type disjunctions", () => {
    const source = "let x = 5;\ntype Status = String | Number;\nlet y = 10;";
    const result = compileTuffToJS(source);
    expect(result).toBe("let x = 5;\n\nlet y = 10;");
  });
});
