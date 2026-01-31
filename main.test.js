const { compileTuffToJS } = require("./main");

// Helper to unwrap Ok results (throws on Err)
function unwrap(result) {
  if (result.kind === "Ok") {
    return result.value;
  }
  throw new Error("Expected Ok but got Err: " + result.err);
}

describe("compileTuffToJS", () => {
  it("should be a function", () => {
    expect(typeof compileTuffToJS).toBe("function");
  });

  it("should return the input unchanged (currently pass-through)", () => {
    const source = "const x = 5;";
    const result = compileTuffToJS(source);
    expect(unwrap(result)).toBe(source);
  });

  it("should handle empty strings", () => {
    const result = compileTuffToJS("");
    expect(unwrap(result)).toBe("");
  });

  it("should handle multi-line input", () => {
    const source = "const x = 5;\nconst y = 10;";
    const result = compileTuffToJS(source);
    expect(unwrap(result)).toBe(source);
  });

  it("should preserve whitespace and formatting", () => {
    const source = "  const x = 5;\n    console.log(x);";
    const result = compileTuffToJS(source);
    expect(unwrap(result)).toBe(source);
  });

  it("should transform extern use to const require syntax", () => {
    const source = "extern use fs from fs;";
    const result = compileTuffToJS(source);
    expect(unwrap(result)).toBe('const fs = require("fs");');
  });

  it("should handle multiple extern use statements", () => {
    const source = "extern use fs from fs;\nextern use path from path;";
    const result = compileTuffToJS(source);
    expect(unwrap(result)).toBe(
      'const fs = require("fs");\nconst path = require("path");',
    );
  });

  it("should transform fn to function keyword", () => {
    const source = "fn myFunc() { return 42; }";
    const result = compileTuffToJS(source);
    expect(unwrap(result)).toBe("function myFunc() { return 42; }");
  });

  it("should handle fn with parameters", () => {
    const source = "fn add(a, b) { return a + b; }";
    const result = compileTuffToJS(source);
    expect(unwrap(result)).toBe("function add(a, b) { return a + b; }");
  });

  it("should remove => arrow from function definitions", () => {
    const source = "fn myFunc() => { return 42; }";
    const result = compileTuffToJS(source);
    expect(unwrap(result)).toBe("function myFunc() { return 42; }");
  });

  it("should handle fn with arrow and parameters", () => {
    const source = "fn add(a, b) => { return a + b; }";
    const result = compileTuffToJS(source);
    expect(unwrap(result)).toBe("function add(a, b) { return a + b; }");
  });

  it("should remove type annotations from function parameters", () => {
    const source = "fn compileTuffToJS(source : String) => { return source; }";
    const result = compileTuffToJS(source);
    expect(unwrap(result)).toBe(
      "function compileTuffToJS(source) { return source; }",
    );
  });

  it("should handle multiple parameters with type annotations", () => {
    const source = "fn add(a : Number, b : Number) => { return a + b; }";
    const result = compileTuffToJS(source);
    expect(unwrap(result)).toBe("function add(a, b) { return a + b; }");
  });

  it("should remove return type annotations from functions", () => {
    const source = 'fn getValue() : String => { return "hello"; }';
    const result = compileTuffToJS(source);
    expect(unwrap(result)).toBe('function getValue() { return "hello"; }');
  });

  it("should handle functions with parameters and return types", () => {
    const source =
      "fn add(a : Number, b : Number) : Number => { return a + b; }";
    const result = compileTuffToJS(source);
    expect(unwrap(result)).toBe("function add(a, b) { return a + b; }");
  });

  it("should transform Rust-like for loops to JavaScript", () => {
    const source = "for (let i in 0..5) { }";
    const result = compileTuffToJS(source);
    expect(unwrap(result)).toBe("for (let i = 0; i < 5; i = i + 1) { }");
  });

  it("should handle for loops with variables", () => {
    const source = "for (let i in 0..lines.length) { }";
    const result = compileTuffToJS(source);
    expect(unwrap(result)).toBe(
      "for (let i = 0; i < lines.length; i = i + 1) { }",
    );
  });

  it("should handle multiple for loops", () => {
    const source = "for (let i in 0..10) { }\nfor (let j in 0..20) { }";
    const result = compileTuffToJS(source);
    expect(unwrap(result)).toBe(
      "for (let i = 0; i < 10; i = i + 1) { }\nfor (let j = 0; j < 20; j = j + 1) { }",
    );
  });

  it("should remove mut keyword from let declarations", () => {
    const source = "let mut x = 5;";
    const result = compileTuffToJS(source);
    expect(unwrap(result)).toBe("let x = 5;");
  });

  it("should handle multiple mut declarations", () => {
    const source = "let mut x = 5;\nlet mut y = 10;";
    const result = compileTuffToJS(source);
    expect(unwrap(result)).toBe("let x = 5;\nlet y = 10;");
  });

  it("should preserve non-mut let declarations", () => {
    const source = "let x = 5;";
    const result = compileTuffToJS(source);
    expect(unwrap(result)).toBe("let x = 5;");
  });

  it("should error if immutable variable is reassigned", () => {
    const source = "let x = 5;\nx = 10;";
    const result = compileTuffToJS(source);
    expect(result.kind).toBe("Err");
    expect(result.err).toContain("cannot reassign immutable variable");
  });

  it("should allow reassignment of mut variables", () => {
    const source = "let mut x = 5;\nx = 10;";
    const result = compileTuffToJS(source);
    expect(result.kind).toBe("Ok");
    expect(result.value).toBe("let x = 5;\nx = 10;");
  });

  it("should error on multiple reassignments without mut", () => {
    const source = "let x = 5;\nx = 10;\nx = 15;";
    const result = compileTuffToJS(source);
    expect(result.kind).toBe("Err");
    expect(result.err).toContain("cannot reassign immutable variable");
  });

  it("should remove type annotations from let declarations", () => {
    const source = "let x : Number = 5;";
    const result = compileTuffToJS(source);
    expect(unwrap(result)).toBe("let x = 5;");
  });

  it("should remove type annotations from mutable let declarations", () => {
    const source = 'let mut y : String = "hello";';
    const result = compileTuffToJS(source);
    expect(unwrap(result)).toBe('let y = "hello";');
  });

  it("should handle multiple local declarations with types", () => {
    const source = 'let x : Number = 5;\nlet y : String = "test";';
    const result = compileTuffToJS(source);
    expect(unwrap(result)).toBe('let x = 5;\nlet y = "test";');
  });

  it("should remove type alias declarations", () => {
    const source = "type MyString = String;";
    const result = compileTuffToJS(source);
    expect(unwrap(result)).toBe("");
  });

  it("should handle multiple type aliases", () => {
    const source = "type MyString = String;\ntype MyNumber = Number;";
    const result = compileTuffToJS(source);
    expect(unwrap(result)).toBe("\n");
  });

  it("should preserve code around type aliases", () => {
    const source = "let x = 5;\ntype MyString = String;\nlet y = 10;";
    const result = compileTuffToJS(source);
    expect(unwrap(result)).toBe("let x = 5;\n\nlet y = 10;");
  });

  it("should remove type disjunctions in type aliases", () => {
    const source = "type Status = String | Number;";
    const result = compileTuffToJS(source);
    expect(unwrap(result)).toBe("");
  });

  it("should handle multiple disjunctions in union types", () => {
    const source = "type Value = String | Number | Boolean;";
    const result = compileTuffToJS(source);
    expect(unwrap(result)).toBe("");
  });

  it("should preserve code around type disjunctions", () => {
    const source = "let x = 5;\ntype Status = String | Number;\nlet y = 10;";
    const result = compileTuffToJS(source);
    expect(unwrap(result)).toBe("let x = 5;\n\nlet y = 10;");
  });

  it("should remove struct declarations", () => {
    const source = "struct User { name : String; }";
    const result = compileTuffToJS(source);
    expect(unwrap(result)).toBe("");
  });

  it("should handle multi-line struct declarations", () => {
    const source = "struct User {\n  name : String;\n  age : Number;\n}";
    const result = compileTuffToJS(source);
    expect(unwrap(result)).toBe("\n\n\n");
  });

  it("should preserve code around struct declarations", () => {
    const source = "let x = 5;\nstruct User { name : String; }\nlet y = 10;";
    const result = compileTuffToJS(source);
    expect(unwrap(result)).toBe("let x = 5;\n\nlet y = 10;");
  });

  it("should remove generic struct declarations", () => {
    const source = "struct Ok<T> { value : T; }";
    const result = compileTuffToJS(source);
    expect(unwrap(result)).toBe("");
  });

  it("should handle multiple type parameters in structs", () => {
    const source = "struct Pair<A, B> { first : A; second : B; }";
    const result = compileTuffToJS(source);
    expect(unwrap(result)).toBe("");
  });

  it("should handle nested type parameters in structs", () => {
    const source = "struct Container<T<U>> { data : T<U>; }";
    const result = compileTuffToJS(source);
    expect(unwrap(result)).toBe("");
  });

  it("should preserve code around generic struct declarations", () => {
    const source = "let x = 5;\nstruct Result<T> { ok : T; }\nlet y = 10;";
    const result = compileTuffToJS(source);
    expect(unwrap(result)).toBe("let x = 5;\n\nlet y = 10;");
  });

  it("should remove generic type aliases", () => {
    const source = "type Maybe<T> = T | null;";
    const result = compileTuffToJS(source);
    expect(unwrap(result)).toBe("");
  });

  it("should handle multiple type parameters in type aliases", () => {
    const source = "type Pair<A, B> = A | B;";
    const result = compileTuffToJS(source);
    expect(unwrap(result)).toBe("");
  });

  it("should handle nested type parameters in type aliases", () => {
    const source = "type Container<T<U>> = T<U> | null;";
    const result = compileTuffToJS(source);
    expect(unwrap(result)).toBe("");
  });

  it("should preserve code around generic type aliases", () => {
    const source = "let x = 5;\ntype Result<T> = T | Error;\nlet y = 10;";
    const result = compileTuffToJS(source);
    expect(unwrap(result)).toBe("let x = 5;\n\nlet y = 10;");
  });

  it("should remove type parameters from struct instantiation", () => {
    const source = 'let result = Err<String> { err : "Sample" };';
    const result = compileTuffToJS(source);
    expect(unwrap(result)).toBe(
      'let result = { kind : "Err", err : "Sample" };',
    );
  });

  it("should handle multiple type parameters in struct instantiation", () => {
    const source =
      'let pair = Pair<String, Number> { first : "a", second : 42 };';
    const result = compileTuffToJS(source);
    expect(unwrap(result)).toBe(
      'let pair = { kind : "Pair", first : "a", second : 42 };',
    );
  });

  it("should handle nested generics in struct instantiation", () => {
    const source = "let container = Container<Vec<T>> { data : items };";
    const result = compileTuffToJS(source);
    expect(unwrap(result)).toBe(
      'let container = { kind : "Container", data : items };',
    );
  });

  it("should handle multiple struct instantiations on one line", () => {
    const source = "let x = Ok<T> { value : 5 }; let y = Err<E> { err : msg };";
    const result = compileTuffToJS(source);
    expect(unwrap(result)).toBe(
      'let x = { kind : "Ok", value : 5 }; let y = { kind : "Err", err : msg };',
    );
  });

  it("should transform 'is' operator for basic type checking", () => {
    const source = "let isOk = value is Ok<T>;";
    const result = compileTuffToJS(source);
    expect(unwrap(result)).toBe('let isOk = value.kind === "Ok";');
  });

  it("should transform 'is' operator with different variants", () => {
    const source = "let isErr = result is Err<X>;";
    const result = compileTuffToJS(source);
    expect(unwrap(result)).toBe('let isErr = result.kind === "Err";');
  });

  it("should transform multiple 'is' checks on one line", () => {
    const source = "let ok = x is Ok<T>; let err = x is Err<E>;";
    const result = compileTuffToJS(source);
    expect(unwrap(result)).toBe(
      'let ok = x.kind === "Ok"; let err = x.kind === "Err";',
    );
  });

  it("should add 'kind' property to struct instantiations", () => {
    const source = "let result = Ok { value : 42 };";
    const result = compileTuffToJS(source);
    expect(unwrap(result)).toBe('let result = { kind : "Ok", value : 42 };');
  });

  it("should add 'kind' to struct instantiation with multiple fields", () => {
    const source = 'let err = Err { err : "msg", code : 500 };';
    const result = compileTuffToJS(source);
    expect(unwrap(result)).toBe(
      'let err = { kind : "Err", err : "msg", code : 500 };',
    );
  });

  it("should handle struct instantiation without type parameters", () => {
    const source = "let val = MyStruct { field : 10 };";
    const result = compileTuffToJS(source);
    expect(unwrap(result)).toBe('let val = { kind : "MyStruct", field : 10 };');
  });

  it("should remove &[Any] type annotations from function parameters", () => {
    const source = "fn collectMutVariables(source : String) : &[Any] => { }";
    const result = compileTuffToJS(source);
    expect(unwrap(result)).toBe("function collectMutVariables(source) { }");
  });

  it("should remove &[Any] type annotations from let declarations", () => {
    const source = "let mut mutVariables : &[Any] = [];";
    const result = compileTuffToJS(source);
    expect(unwrap(result)).toBe("let mutVariables = [];");
  });

  it("should handle multiple &[Any] annotations", () => {
    const source =
      "fn validateMutability(source : String, mutVariables : &[Any]) : Result<String, String> => { }";
    const result = compileTuffToJS(source);
    expect(unwrap(result)).toBe(
      "function validateMutability(source, mutVariables) { }",
    );
  });

  it("should remove &[Any] with other type annotations", () => {
    const source =
      'let x : Number = 5;\nlet y : &[Any] = [];\nlet z : String = "test";';
    const result = compileTuffToJS(source);
    expect(unwrap(result)).toBe('let x = 5;\nlet y = [];\nlet z = "test";');
  });
});
