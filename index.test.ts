import { compileTuffToJS } from ".";
import { describe, it, expect } from "bun:test";
import type { CompileErrorKind } from "./src/compileError";

function evaluate(source: string, args: string[] = []) {
  const compiled = compileTuffToJS("in let args : &[Str]; " + source);
  if (!compiled.ok) {
    expect(compiled.error).toBeUndefined();
    return;
  }

  // evaluate() is only called with valid sources; error cases use compileTuffToJS directly
  const generatedJS = compiled.ok ? compiled.value : "";
  const wrappedJS =
    "let __exit__ = 0; let process = { exit : (arg) => { __exit__ = arg; } }; " +
    generatedJS +
    " return __exit__;";

  const newArgs = ["mock_program_name.exe", ...args];
  return new Function("args", wrappedJS)(newArgs) as number;
}

// Assert that compiling `source` fails with an error of the given kind.
// The kind is the error's `kind` field: "scope" for semantic errors,
// "syntax" for syntax/lexical errors.
function expectCompileError(source: string, errorKind: CompileErrorKind) {
  const result = compileTuffToJS(source);
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error.kind).toBe(errorKind);
  }
}

describe("tuff", () => {
  it('evaluate("") => 0', () => {
    expect(evaluate("", [])).toBe(0);
  });

  it('evaluate(" ") => 0', () => {
    expect(evaluate(" ", [])).toBe(0);
  });

  it('evaluate("args.length") => 1', () => {
    expect(evaluate("args.length", [])).toBe(1);
  });

  it('evaluate("args.length + 1") => 2', () => {
    expect(evaluate("args.length + 1", [])).toBe(2);
  });

  it('evaluate("args.length + args.length") => 2', () => {
    expect(evaluate("args.length + args.length", [])).toBe(2);
  });

  it('evaluate("let x = args.length; x") => 1', () => {
    expect(evaluate("let x = args.length; x", [])).toBe(1);
  });

  it('evaluate("let x = args.length; let y = x; y") => 1', () => {
    expect(evaluate("let x = args.length; let y = x; y", [])).toBe(1);
  });

  it('compile("undefinedIdentifier") => scope', () => {
    expectCompileError("undefinedIdentifier", "scope");
  });

  it('evaluate("let x = 0; let x = 1; x") => 1', () => {
    expect(evaluate("let x = 0; let x = 1; x", [])).toBe(1);
  });

  it('evaluate("let mut x = 0; x = 1; x") => 1', () => {
    expect(evaluate("let mut x = 0; x = 1; x", [])).toBe(1);
  });

  it('compile("let x = 0; x = 1; x") => scope', () => {
    expectCompileError("let x = 0; x = 1; x", "scope");
  });

  it('evaluate("let x = true; x") => 1', () => {
    expect(evaluate("let x = true; x", [])).toBe(1);
  });

  it('evaluate("let x = true; let y = false; x || y") => 1', () => {
    expect(evaluate("let x = true; let y = false; x || y", [])).toBe(1);
  });

  it('evaluate("let x = true; let y = false; x && y") => 0', () => {
    expect(evaluate("let x = true; let y = false; x && y", [])).toBe(0);
  });

  it('evaluate("let x = 0; let y = 1; x < y") => 1', () => {
    expect(evaluate("let x = 0; let y = 1; x < y", [])).toBe(1);
  });

  it('evaluate("let x = 0; let y = 1; x <= y") => 1', () => {
    expect(evaluate("let x = 0; let y = 1; x <= y", [])).toBe(1);
  });

  it('evaluate("let x = 0; let y = 1; x == y") => 0', () => {
    expect(evaluate("let x = 0; let y = 1; x == y", [])).toBe(0);
  });

  it('evaluate("let x = 0; let y = 1; x > y") => 0', () => {
    expect(evaluate("let x = 0; let y = 1; x > y", [])).toBe(0);
  });

  it('evaluate("let x = 0; let y = 1; x >= y") => 0', () => {
    expect(evaluate("let x = 0; let y = 1; x >= y", [])).toBe(0);
  });

  it('evaluate("let x = 0; let y = 1; x != y") => 1', () => {
    expect(evaluate("let x = 0; let y = 1; x != y", [])).toBe(1);
  });

  it('evaluate("let x = if (true) 2 else 3; x") => 2', () => {
    expect(evaluate("let x = if (true) 2 else 3; x", [])).toBe(2);
  });

  it('evaluate("let x = if (false) 2 else if (false) 3 else 4; x") => 4', () => {
    expect(
      evaluate("let x = if (false) 2 else if (false) 3 else 4; x", []),
    ).toBe(4);
  });

  it('compile("let x = if (false) 2; x") => syntax', () => {
    expectCompileError("let x = if (false) 2; x", "syntax");
  });

  it('evaluate("let mut x = 0; { x = 1; } x") => 1', () => {
    expect(evaluate("let mut x = 0; { x = 1; } x", [])).toBe(1);
  });

  it('evaluate("let x = 100;") => 0', () => {
    expect(evaluate("let x = 100;", [])).toBe(0);
  });

  it('compile("let x = { let y = 100; }; x") => scope', () => {
    expectCompileError("let x = { let y = 100; }; x", "scope");
  });

  it('compile("let mut y = 0; let x = { y = 1; }; x") => syntax', () => {
    expectCompileError("let mut y = 0; let x = { y = 1; }; x", "syntax");
  });

  it('evaluate("let mut x = 0; if (true) { x = 1; } else { x = 2; } x") => 1', () => {
    expect(
      evaluate("let mut x = 0; if (true) { x = 1; } else { x = 2; } x", []),
    ).toBe(1);
  });

  it('evaluate("let mut x = 0; if (true) { x = 1; } x") => 1', () => {
    expect(evaluate("let mut x = 0; if (true) { x = 1; } x", [])).toBe(1);
  });

  it('evaluate("let mut x = 1; x += 2; x") => 3', () => {
    expect(evaluate("let mut x = 1; x += 2; x", [])).toBe(3);
  });

  it('evaluate("let mut x = 0; while (x < 4) { x += 1; } x") => 4', () => {
    expect(evaluate("let mut x = 0; while (x < 4) { x += 1; } x", [])).toBe(4);
  });

  it('evaluate("let mut x = 0; while (x < 4) x += 1; x") => 4', () => {
    expect(evaluate("let mut x = 0; while (x < 4) x += 1; x", [])).toBe(4);
  });

  it('evaluate("100U8") => 100', () => {
    expect(evaluate("100U8", [])).toBe(100);
  });

  it('compile("256U8") => syntax', () => {
    expectCompileError("256U8", "syntax");
  });

  it('compile("-100U8") => syntax', () => {
    expectCompileError("-100U8", "syntax");
  });

  it('evaluate("let x : U8 = 100U8; x") => 100', () => {
    expect(evaluate("let x : U8 = 100U8; x", [])).toBe(100);
  });

  it('evaluate("let x : U16 = 100U8; x") => 100', () => {
    expect(evaluate("let x : U16 = 100U8; x", [])).toBe(100);
  });

  it('compile("let x : U8 = 100U16; x") => syntax', () => {
    expectCompileError("let x : U8 = 100U16; x", "syntax");
  });

  it('compile("let x = 100U16; let y : U8 = x;") => syntax', () => {
    expectCompileError("let x = 100U16; let y : U8 = x;", "syntax");
  });

  it('evaluate("let x : U16 = 100U16; x") => 100', () => {
    expect(evaluate("let x : U16 = 100U16; x", [])).toBe(100);
  });

  it('compile("65536U16") => syntax', () => {
    expectCompileError("65536U16", "syntax");
  });

  it('evaluate("let x : Bool = true; x") => 1', () => {
    expect(evaluate("let x : Bool = true; x", [])).toBe(1);
  });

  it('compile("let x : Foo = true; x") => syntax', () => {
    expectCompileError("let x : Foo = true; x", "syntax");
  });

  it('compile("let x : Bool = 1;") => syntax', () => {
    expectCompileError("let x : Bool = 1;", "syntax");
  });

  it('evaluate("let x : U8 = 1; x") => 1', () => {
    expect(evaluate("let x : U8 = 1; x", [])).toBe(1);
  });

  it('evaluate("true is Bool") => 1', () => {
    expect(evaluate("true is Bool", [])).toBe(1);
  });

  it('evaluate("1 is Bool") => 0', () => {
    expect(evaluate("1 is Bool", [])).toBe(0);
  });

  it('evaluate("100U8 is U8") => 1', () => {
    expect(evaluate("100U8 is U8", [])).toBe(1);
  });

  it('compile("true is Foo") => syntax', () => {
    expectCompileError("true is Foo", "syntax");
  });

  it('evaluate("100 is I32") => 1', () => {
    expect(evaluate("100 is I32", [])).toBe(1);
  });

  it('evaluate("let x : I32 = 100; x") => 100', () => {
    expect(evaluate("let x : I32 = 100; x", [])).toBe(100);
  });

  it('evaluate("100U8 is U16") => 0', () => {
    expect(evaluate("100U8 is U16", [])).toBe(0);
  });

  it('evaluate("let x : I32 = 100U8; x") => 100', () => {
    expect(evaluate("let x : I32 = 100U8; x", [])).toBe(100);
  });

  it('evaluate("100U16 is I32") => 0', () => {
    expect(evaluate("100U16 is I32", [])).toBe(0);
  });

  it('evaluate("(100U8) is U8") => 1', () => {
    expect(evaluate("(100U8) is U8", [])).toBe(1);
  });

  it('evaluate("(1 is Bool)") => 0', () => {
    expect(evaluate("(1 is Bool)", [])).toBe(0);
  });

  it('evaluate("(2 + 3) * 4") => 20', () => {
    expect(evaluate("(2 + 3) * 4", [])).toBe(20);
  });

  it('evaluate("let x = 100; x is I32") => 1', () => {
    expect(evaluate("let x = 100; x is I32", [])).toBe(1);
  });

  it('evaluate("{ let x = 100U64; x } is U64") => 1', () => {
    expect(evaluate("{ let x = 100U64; x } is U64", [])).toBe(1);
  });

  it('evaluate("fn get() : I32 => 100; get()") => 100', () => {
    expect(evaluate("fn get() : I32 => 100; get()", [])).toBe(100);
  });

  it('evaluate("fn add(first : I32, second : I32) : I32 => first + second; add(3, 4)") => 7', () => {
    expect(
      evaluate(
        "fn add(first : I32, second : I32) : I32 => first + second; add(3, 4)",
        [],
      ),
    ).toBe(7);
  });

  it('compile("let get = 0; fn get() : I32 => 0;") => scope', () => {
    expectCompileError("let get = 0; fn get() : I32 => 0;", "scope");
  });

  it('evaluate("fn empty() : Void => {}") => 0', () => {
    expect(evaluate("fn empty() : Void => {}", [])).toBe(0);
  });

  it('evaluate("let x = 100; let y : &I32 = &x; *y") => 100', () => {
    expect(evaluate("let x = 100; let y : &I32 = &x; *y", [])).toBe(100);
  });

  it('evaluate("let mut x = 0; let y : &mut I32 = &mut x; *y = 100; x") => 100', () => {
    expect(
      evaluate("let mut x = 0; let y : &mut I32 = &mut x; *y = 100; x", []),
    ).toBe(100);
  });

  it('evaluate("let array : [I32; 3] = [1, 2, 3]; array[0] + array[1] + array[2]") => 6', () => {
    expect(
      evaluate(
        "let array : [I32; 3] = [1, 2, 3]; array[0] + array[1] + array[2]",
        [],
      ),
    ).toBe(6);
  });

  it('evaluate("struct Point { x : I32, y : I32 } let pt : Point = Point { x : 3, y : 4 }; pt.x + pt.y") => 7', () => {
    expect(
      evaluate(
        "struct Point { x : I32, y : I32 } let pt : Point = Point { x : 3, y : 4 }; pt.x + pt.y",
        [],
      ),
    ).toBe(7);
  });

  it('evaluate("// comment\\nargs.length") => 1', () => {
    expect(evaluate("// comment\nargs.length", [])).toBe(1);
  });

  it('evaluate("args.length // trailing comment") => 1', () => {
    expect(evaluate("args.length // trailing comment", [])).toBe(1);
  });

  it('evaluate("/* block */ args.length") => 1', () => {
    expect(evaluate("/* block */ args.length", [])).toBe(1);
  });

  it('evaluate("/* multi\\nline */ args.length") => 1', () => {
    expect(evaluate("/* multi\nline */ args.length", [])).toBe(1);
  });

  it('evaluate("args.length /* trailing */") => 1', () => {
    expect(evaluate("args.length /* trailing */", [])).toBe(1);
  });

  it('evaluate("let x = 1; // comment\\nx") => 1', () => {
    expect(evaluate("let x = 1; // comment\nx", [])).toBe(1);
  });

  it('evaluate("/* comment */ let x = 1; /* another */ x") => 1', () => {
    expect(evaluate("/* comment */ let x = 1; /* another */ x", [])).toBe(1);
  });

  it('compile("/* unterminated") => syntax', () => {
    expectCompileError("/* unterminated", "syntax");
  });

  it('evaluate("// /* not a block */ args.length") => 0', () => {
    expect(evaluate("// /* not a block */ args.length", [])).toBe(0);
  });

  it('evaluate("/* // not a line comment */ args.length") => 1', () => {
    expect(evaluate("/* // not a line comment */ args.length", [])).toBe(1);
  });

  it('evaluate("/* a /* nested */ args.length") => 1', () => {
    expect(evaluate("/* a /* nested */ args.length", [])).toBe(1);
  });

  it('evaluate("args.length /* trailing */ + 1") => 2', () => {
    expect(evaluate("args.length /* trailing */ + 1", [])).toBe(2);
  });

  it('evaluate("/* leading */ args.length") => 1', () => {
    expect(evaluate("/* leading */ args.length", [])).toBe(1);
  });

  it('evaluate("// only a comment") => 0', () => {
    expect(evaluate("// only a comment", [])).toBe(0);
  });

  it('evaluate("/* only a block */") => 0', () => {
    expect(evaluate("/* only a block */", [])).toBe(0);
  });

  it('evaluate("let tuple : (I32, I32) = (3, 4); tuple.0 + tuple.1") => 7', () => {
    expect(
      evaluate("let tuple : (I32, I32) = (3, 4); tuple.0 + tuple.1", []),
    ).toBe(7);
  });

  it('evaluate("let tuple = (3, 4); tuple.0 + tuple.1") => 7', () => {
    expect(evaluate("let tuple = (3, 4); tuple.0 + tuple.1", [])).toBe(7);
  });

  it('evaluate("let tuple : (I32, I32, I32) = (1, 2, 3); tuple.0 + tuple.1 + tuple.2") => 6', () => {
    expect(
      evaluate(
        "let tuple : (I32, I32, I32) = (1, 2, 3); tuple.0 + tuple.1 + tuple.2",
        [],
      ),
    ).toBe(6);
  });

  it('evaluate("let tuple : (I32, Bool) = (3, true); tuple.0") => 3', () => {
    expect(evaluate("let tuple : (I32, Bool) = (3, true); tuple.0", [])).toBe(
      3,
    );
  });

  it('compile("let tuple : (I32, I32) = (3, 4); tuple.2") => scope', () => {
    expectCompileError("let tuple : (I32, I32) = (3, 4); tuple.2", "scope");
  });

  it('compile("let tuple : (I32, I32) = (3, 4, 5);") => syntax', () => {
    expectCompileError("let tuple : (I32, I32) = (3, 4, 5);", "syntax");
  });

  it('evaluate("let tuple : (I32, (I32, I32)) = (1, (2, 3)); let inner = tuple.1; inner.0 + inner.1") => 5', () => {
    expect(
      evaluate(
        "let tuple : (I32, (I32, I32)) = (1, (2, 3)); let inner = tuple.1; inner.0 + inner.1",
        [],
      ),
    ).toBe(5);
  });

  it('evaluate("let x = 100; this.x") => 100', () => {
    expect(evaluate("let x = 100; this.x", [])).toBe(100);
  });

  it('evaluate("let x = 100; let y = 200; this.x + this.y") => 300', () => {
    expect(evaluate("let x = 100; let y = 200; this.x + this.y", [])).toBe(300);
  });

  it('compile("this.x") => scope', () => {
    expectCompileError("this.x", "scope");
  });

  it('evaluate("let mut x = 0; this.x = 100; x") => 100', () => {
    expect(evaluate("let mut x = 0; this.x = 100; x", [])).toBe(100);
  });

  it('evaluate("let mut x = 0; this.x += 100; x") => 100', () => {
    expect(evaluate("let mut x = 0; this.x += 100; x", [])).toBe(100);
  });

  it('compile("let x = 0; this.x = 100;") => scope', () => {
    expectCompileError("let x = 0; this.x = 100;", "scope");
  });

  it('compile("this.x = 100;") => scope', () => {
    expectCompileError("this.x = 100;", "scope");
  });

  it('compile("let temp = &this;") => scope', () => {
    expectCompileError("let temp = &this;", "scope");
  });

  it('compile("let temp = this;") => scope', () => {
    expectCompileError("let temp = this;", "scope");
  });

  it('evaluate("fn Wrapper(field : I32) : Wrapper => this; Wrapper(100).field") => 100', () => {
    expect(
      evaluate(
        "fn Wrapper(field : I32) : Wrapper => this; Wrapper(100).field",
        [],
      ),
    ).toBe(100);
  });

  it('evaluate("fn Pair(a : I32, b : I32) : Pair => this; let p = Pair(3, 4); p.a + p.b") => 7', () => {
    expect(
      evaluate(
        "fn Pair(a : I32, b : I32) : Pair => this; let p = Pair(3, 4); p.a + p.b",
        [],
      ),
    ).toBe(7);
  });

  it('compile("fn Wrapper(field : I32) : Wrapper => this; Wrapper(100).missing") => scope', () => {
    expectCompileError(
      "fn Wrapper(field : I32) : Wrapper => this; Wrapper(100).missing",
      "scope",
    );
  });

  it('evaluate("fn Wrapper() : Wrapper => { let field = 100; this } Wrapper().field") => 100', () => {
    expect(
      evaluate(
        "fn Wrapper() : Wrapper => { let field = 100; this } Wrapper().field",
        [],
      ),
    ).toBe(100);
  });

  it('evaluate("fn addOnce(this : I32) => this + 1; 100.addOnce()") => 101', () => {
    expect(
      evaluate("fn addOnce(this : I32) => this + 1; 100.addOnce()", []),
    ).toBe(101);
  });

  it('evaluate("fn add(this : I32, n : I32) => this + n; 100.add(5)") => 105', () => {
    expect(
      evaluate("fn add(this : I32, n : I32) => this + n; 100.add(5)", []),
    ).toBe(105);
  });

  it('evaluate("let x = 100; fn addOnce(this : I32) => this + 1; x.addOnce()") => 101', () => {
    expect(
      evaluate(
        "let x = 100; fn addOnce(this : I32) => this + 1; x.addOnce()",
        [],
      ),
    ).toBe(101);
  });
});
