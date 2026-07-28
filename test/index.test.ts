import { test, expect, describe } from "bun:test";
import { interpret } from "../src";
import { InterpreterError } from "../src/error";

describe("empty/whitespace input", () => {
  test('interpret("") => 0', () => {
    expect(interpret("")).toBe(0);
  });

  test('interpret(" ") => 0', () => {
    expect(interpret(" ")).toBe(0);
  });
});

describe("number literals", () => {
  test('interpret("1") => 1', () => {
    expect(interpret("1")).toBe(1);
  });

  test('interpret("100U8") => 100', () => {
    expect(interpret("100U8")).toBe(100);
  });

  test('interpret("256U8") => Error', () => {
    expect(() => interpret("256U8")).toThrow();
  });

  test('interpret("-100U8") => Error', () => {
    expect(() => interpret("-100U8")).toThrow();
  });

  test('interpret("let x = 1; -x") => -1', () => {
    expect(interpret("let x = 1; -x")).toBe(-1);
  });

  test('interpret("-(2 + 3)") => -5', () => {
    expect(interpret("-(2 + 3)")).toBe(-5);
  });

  test('interpret("let x : U16 = 100U16; x") => 100', () => {
    expect(interpret("let x : U16 = 100U16; x")).toBe(100);
  });

  test('interpret("let x : U16 = 100U8; x") => 100', () => {
    expect(interpret("let x : U16 = 100U8; x")).toBe(100);
  });

  test('interpret("let x : U8 = 100U16; x") => Error', () => {
    expect(() => interpret("let x : U8 = 100U16; x")).toThrow();
  });

  test('interpret("let x = 100U16; let y : U8 = x;") => Error', () => {
    expect(() => interpret("let x = 100U16; let y : U8 = x;")).toThrow();
  });

  test('interpret("let x : U32 = 100U8; x") => 100', () => {
    expect(interpret("let x : U32 = 100U8; x")).toBe(100);
  });

  test('interpret("let x : Bool = true; x") => 1', () => {
    expect(interpret("let x : Bool = true; x")).toBe(1);
  });

  test('interpret("let x : Bool = 5U8;") => Error', () => {
    expect(() => interpret("let x : Bool = 5U8;")).toThrow();
  });

  test('interpret("5U8 is U8") => 1', () => {
    expect(interpret("5U8 is U8")).toBe(1);
  });

  test('interpret("100U8 is U8 is Bool") => 1', () => {
    expect(interpret("100U8 is U8 is Bool")).toBe(1);
  });

  test('interpret("(100U8 is U8 && 100U8 is U8) is Bool") => 1', () => {
    expect(interpret("(100U8 is U8 && 100U8 is U8) is Bool")).toBe(1);
  });

  test('interpret("true is Bool") => 1', () => {
    expect(interpret("true is Bool")).toBe(1);
  });

  test('interpret("5U8 is U16") => 0', () => {
    expect(interpret("5U8 is U16")).toBe(0);
  });

  test('interpret("5 is I32") => 1', () => {
    expect(interpret("5 is I32")).toBe(1);
  });

  test('interpret("5 is U8") => 0', () => {
    expect(interpret("5 is U8")).toBe(0);
  });

  test('interpret("(100) is I32") => 1', () => {
    expect(interpret("(100) is I32")).toBe(1);
  });

  test('interpret("(100 + 1U8) is U8") => 1', () => {
    expect(interpret("(100 + 1U8) is U8")).toBe(1);
  });

  test('interpret("true + false") => Error', () => {
    expect(() => interpret("true + false")).toThrow();
  });
});

describe("binary expressions", () => {
  test('interpret("1 + 2") => 3', () => {
    expect(interpret("1 + 2")).toBe(3);
  });

  test('interpret("1 + 2 + 3") => 6', () => {
    expect(interpret("1 + 2 + 3")).toBe(6);
  });

  test('interpret("2 + 3 - 4") => 1', () => {
    expect(interpret("2 + 3 - 4")).toBe(1);
  });

  test('interpret("2 * 3 - 4") => 2', () => {
    expect(interpret("2 * 3 - 4")).toBe(2);
  });

  test('interpret("2 + 3 * 4") => 14', () => {
    expect(interpret("2 + 3 * 4")).toBe(14);
  });

  test('interpret("(2 + 3) * 4") => 20', () => {
    expect(interpret("(2 + 3) * 4")).toBe(20);
  });

  test('interpret("(2 + 3) * (1 + 2)") => 15', () => {
    expect(interpret("(2 + 3) * (1 + 2)")).toBe(15);
  });

  test('interpret("{ 2 + 3 } * 4") => 20', () => {
    expect(interpret("{ 2 + 3 } * 4")).toBe(20);
  });

  test('interpret("{ let x = 2 + 3; x } * 4") => 20', () => {
    expect(interpret("{ let x = 2 + 3; x } * 4")).toBe(20);
  });

  test('interpret("let y = { let x = 2 + 3; x } * 4; y") => 20', () => {
    expect(interpret("let y = { let x = 2 + 3; x } * 4; y")).toBe(20);
  });

  test('interpret("let x = 0; let x = 1; x") => 1', () => {
    expect(interpret("let x = 0; let x = 1; x")).toBe(1);
  });

  test('interpret("undefinedIdentifier") => Error', () => {
    expect(() => interpret("undefinedIdentifier")).toThrow();
  });

  test('interpret("let x = 100;") => 0', () => {
    expect(interpret("let x = 100;")).toBe(0);
  });

  test('interpret("let x = { let y = 100; };") => Error', () => {
    expect(() => interpret("let x = { let y = 100; };")).toThrow();
  });

  test('interpret("{ let y = 100; }") => 0 (statement context)', () => {
    expect(interpret("{ let y = 100; }")).toBe(0);
  });

  test('interpret("{ { let x = 1; } }") => 0 (nested statement)', () => {
    expect(interpret("{ { let x = 1; } }")).toBe(0);
  });

  test('interpret("{ let a = 1; a } * 2") => 2', () => {
    expect(interpret("{ let a = 1; a } * 2")).toBe(2);
  });

  test('interpret("let x = true; x") => 1', () => {
    expect(interpret("let x = true; x")).toBe(1);
  });

  test('interpret("let x = true; let y = false; x || y") => 1', () => {
    expect(interpret("let x = true; let y = false; x || y")).toBe(1);
  });

  test('interpret("let x = true; let y = false; x && y") => 0', () => {
    expect(interpret("let x = true; let y = false; x && y")).toBe(0);
  });

  test('interpret("let x = 0; let y = 1; x < y") => 1', () => {
    expect(interpret("let x = 0; let y = 1; x < y")).toBe(1);
  });

  test('interpret("let x = 0; let y = 1; x > y") => 0', () => {
    expect(interpret("let x = 0; let y = 1; x > y")).toBe(0);
  });

  test('interpret("let x = 0; let y = 1; x == y") => 0', () => {
    expect(interpret("let x = 0; let y = 1; x == y")).toBe(0);
  });

  test('interpret("let x = 0; let y = 1; x != y") => 1', () => {
    expect(interpret("let x = 0; let y = 1; x != y")).toBe(1);
  });

  test('interpret("let x = 0; let y = 1; x <= y") => 1', () => {
    expect(interpret("let x = 0; let y = 1; x <= y")).toBe(1);
  });

  test('interpret("let x = 0; let y = 1; x >= y") => 0', () => {
    expect(interpret("let x = 0; let y = 1; x >= y")).toBe(0);
  });

  test('interpret("let x = if (true) 2 else 3; x") => 2', () => {
    expect(interpret("let x = if (true) 2 else 3; x")).toBe(2);
  });

  test('interpret("let x = if (false) 2 else if (false) 3 else 4; x") => 4', () => {
    expect(interpret("let x = if (false) 2 else if (false) 3 else 4; x")).toBe(
      4,
    );
  });

  test('interpret("let mut x = 0; if (false) { x = 2; } else if (false) { x = 3; } else { x = 4; } x") => 4', () => {
    expect(
      interpret(
        "let mut x = 0; if (false) { x = 2; } else if (false) { x = 3; } else { x = 4; } x",
      ),
    ).toBe(4);
  });

  test('interpret("let x = 0; x = 1; x") => Error', () => {
    expect(() => interpret("let x = 0; x = 1; x")).toThrow();
  });

  test('interpret("let x = loop { break 3; }; x") => 3', () => {
    expect(interpret("let x = loop { break 3; }; x")).toBe(3);
  });

  test('interpret("loop { break loop { break 5; } }") => 5', () => {
    expect(interpret("loop { break loop { break 5; } }")).toBe(5);
  });

  test('interpret("if (true) { let x = 1; }") => 0 (if statement without else)', () => {
    expect(interpret("if (true) { let x = 1; }")).toBe(0);
  });

  test('interpret("let mut x = 1; x += 2; x") => 3', () => {
    expect(interpret("let mut x = 1; x += 2; x")).toBe(3);
  });

  test('interpret("let mut x = 0; while (x < 4) { x += 1; } x") => 4', () => {
    expect(interpret("let mut x = 0; while (x < 4) { x += 1; } x")).toBe(4);
  });

  test('interpret("{ let x = 0; } is Void") => 1', () => {
    expect(interpret("{ let x = 0; } is Void")).toBe(1);
  });

  test('interpret("(100U8 + 100I8) is I16") => 1', () => {
    expect(interpret("(100U8 + 100I8) is I16")).toBe(1);
  });

  test('interpret("let mut x = 0U8; x = 0U16;") => Error', () => {
    expect(() => interpret("let mut x = 0U8; x = 0U16;")).toThrow();
  });

  test('interpret("let mut x = 0U8; x += 0U16;") => Error', () => {
    expect(() => interpret("let mut x = 0U8; x += 0U16;")).toThrow();
  });

  test('interpret("let mut x = false; x += true;") => Error', () => {
    expect(() => interpret("let mut x = false; x += true;")).toThrow();
  });

  test('interpret("let x = 100; x is I32") => 1', () => {
    expect(interpret("let x = 100; x is I32")).toBe(1);
  });

  test('interpret("loop { break 100U8; } is U8") => 1', () => {
    expect(interpret("loop { break 100U8; } is U8")).toBe(1);
  });

  test('interpret("fn get() => 100; get()") => 100', () => {
    expect(interpret("fn get() => 100; get()")).toBe(100);
  });

  test('interpret("fn add(first : I32, second : I32) => first + second; add(3, 4)") => 7', () => {
    expect(
      interpret(
        "fn add(first : I32, second : I32) => first + second; add(3, 4)",
      ),
    ).toBe(7);
  });

  test('interpret("fn get() => 0U16; let x : U8 = get();") => Error', () => {
    expect(() => interpret("fn get() => 0U16; let x : U8 = get();")).toThrow();
  });

  test('interpret("let get = 0; fn get() => 100;") => Error', () => {
    expect(() => interpret("let get = 0; fn get() => 100;")).toThrow();
  });

  test('interpret("fn get() => 100; fn get() => 200;") => Error', () => {
    expect(() => interpret("fn get() => 100; fn get() => 200;")).toThrow();
  });

  test('interpret("fn accept(param : U8) => {} accept(0U16)") => Error', () => {
    expect(() =>
      interpret("fn accept(param : U8) => {} accept(0U16)"),
    ).toThrow();
  });

  test('interpret("fn foo(x : U8, x : U16) => x") => Error (duplicate param)', () => {
    expect(() => interpret("fn foo(x : U8, x : U16) => x")).toThrow();
  });

  test('interpret("fn get() : U8 => 0U16;") => Error (return type mismatch)', () => {
    expect(() => interpret("fn get() : U8 => 0U16;")).toThrow();
  });

  test('interpret("fn add(a, b) => a + b; add(1)") => Error (missing param)', () => {
    expect(() => interpret("fn add(a, b) => a + b; add(1)")).toThrow();
  });

  test('interpret("fn get() => 1; get(1)") => Error (extra param)', () => {
    expect(() => interpret("fn get() => 1; get(1)")).toThrow();
  });

  test('interpret("let x = 1; let ptr : &I32 = &x; *ptr") => 1', () => {
    expect(interpret("let x = 1; let ptr : &I32 = &x; *ptr")).toBe(1);
  });

  test('interpret("let mut x = 0; let y : &mut I32 = &mut x; *y = 1; x") => 1', () => {
    expect(
      interpret("let mut x = 0; let y : &mut I32 = &mut x; *y = 1; x"),
    ).toBe(1);
  });

  test('interpret("let mut x = 1; let y : &mut I32 = &mut x; *y += 2; x") => 3', () => {
    expect(
      interpret("let mut x = 1; let y : &mut I32 = &mut x; *y += 2; x"),
    ).toBe(3);
  });

  test('interpret("let mut x = 0; let y = &x; *y = 3;") => Error', () => {
    expect(() => interpret("let mut x = 0; let y = &x; *y = 3;")).toThrow();
  });

  test('interpret("let array : [I32; 3] = [1, 2, 3]; array[0]") => 1', () => {
    expect(interpret("let array : [I32; 3] = [1, 2, 3]; array[0]")).toBe(1);
  });

  test('interpret("let mut array = [0]; array[0] = 1; array[0]") => 1', () => {
    expect(interpret("let mut array = [0]; array[0] = 1; array[0]")).toBe(1);
  });

  test('interpret("let mut array = [1]; array[0] += 2; array[0]") => 3', () => {
    expect(interpret("let mut array = [1]; array[0] += 2; array[0]")).toBe(3);
  });

  test('interpret("let array = [1, 2]; let ptr : &[I32; 2] = &array; ptr[0]") => 1', () => {
    expect(
      interpret("let array = [1, 2]; let ptr : &[I32; 2] = &array; ptr[0]"),
    ).toBe(1);
  });

  test('interpret("let array = [1, 2]; let ptr0 = &array; let ptr1 = &ptr0; ptr1[0]") => 1', () => {
    expect(
      interpret(
        "let array = [1, 2]; let ptr0 = &array; let ptr1 = &ptr0; ptr1[0]",
      ),
    ).toBe(1);
  });

  test('interpret("struct Empty {}") => 0', () => {
    expect(interpret("struct Empty {}")).toBe(0);
  });

  test('interpret("struct Empty { x : I32 }") => 0', () => {
    expect(interpret("struct Empty { x : I32 }")).toBe(0);
  });

  test('interpret("struct Empty { x : I32, y : I32 }") => 0', () => {
    expect(interpret("struct Empty { x : I32, y : I32 }")).toBe(0);
  });

  test('interpret("struct Empty { x : I32, x : I32 }") => Error', () => {
    expect(() => interpret("struct Empty { x : I32, x : I32 }")).toThrow();
  });

  test('interpret("struct Point { x : I32, y : I32 } let pt = Point { x : 3, y : 4 }; pt.x + pt.y") => 7', () => {
    expect(
      interpret(
        "struct Point { x : I32, y : I32 } let pt = Point { x : 3, y : 4 }; pt.x + pt.y",
      ),
    ).toBe(7);
  });

  test('interpret("struct Point { x : I32, y : I32 } let pt : Point = Point { x : 3, y : 4 }; pt.x + pt.y") => 7', () => {
    expect(
      interpret(
        "struct Point { x : I32, y : I32 } let pt : Point = Point { x : 3, y : 4 }; pt.x + pt.y",
      ),
    ).toBe(7);
  });
});

describe("error positions", () => {
  test("parse error has position", () => {
    try {
      interpret("let x = ");
    } catch (e) {
      if (e instanceof InterpreterError) {
        expect(e.position).toBeDefined();
        expect(e.position!.line).toBeGreaterThanOrEqual(1);
        expect(e.position!.column).toBeGreaterThanOrEqual(1);
      } else {
        throw e;
      }
    }
  });

  test("type error has position (duplicate fn)", () => {
    try {
      interpret("fn get() => 1; fn get() => 2;");
    } catch (e) {
      if (e instanceof InterpreterError) {
        expect(e.position).toBeDefined();
        expect(e.position!.line).toBe(1);
        expect(e.position!.column).toBeGreaterThanOrEqual(1);
      } else {
        throw e;
      }
    }
  });

  test("type error has position (type mismatch)", () => {
    try {
      interpret("let x : U8 = 100U16;");
    } catch (e) {
      if (e instanceof InterpreterError) {
        expect(e.position).toBeDefined();
        expect(e.position!.line).toBe(1);
        expect(e.position!.column).toBeGreaterThanOrEqual(1);
      } else {
        throw e;
      }
    }
  });

  test("runtime error has position (undefined identifier)", () => {
    try {
      interpret("foo");
    } catch (e) {
      if (e instanceof InterpreterError) {
        expect(e.position).toBeDefined();
        expect(e.position!.line).toBe(1);
        expect(e.position!.column).toBe(1);
      } else {
        throw e;
      }
    }
  });

  test("type error has position (immutable assign)", () => {
    try {
      interpret("let x = 0; x = 1;");
    } catch (e) {
      if (e instanceof InterpreterError) {
        expect(e.position).toBeDefined();
        expect(e.position!.line).toBe(1);
        expect(e.position!.column).toBeGreaterThanOrEqual(1);
      } else {
        throw e;
      }
    }
  });

  test("parse error on line 2", () => {
    try {
      interpret("let x = 1\nlet y = ");
    } catch (e) {
      if (e instanceof InterpreterError) {
        expect(e.position).toBeDefined();
        expect(e.position!.line).toBeGreaterThanOrEqual(1);
      } else {
        throw e;
      }
    }
  });

  test("type error on line 2 (duplicate fn)", () => {
    try {
      interpret("fn get() => 1;\nfn get() => 2;");
    } catch (e) {
      if (e instanceof InterpreterError) {
        expect(e.position).toBeDefined();
        expect(e.position!.line).toBe(2);
        expect(e.position!.column).toBe(1);
      } else {
        throw e;
      }
    }
  });

  test("runtime error on line 2 (undefined fn)", () => {
    try {
      interpret("let x = 1;\nfoo();");
    } catch (e) {
      if (e instanceof InterpreterError) {
        expect(e.position).toBeDefined();
        expect(e.position!.line).toBe(2);
        expect(e.position!.column).toBeGreaterThanOrEqual(1);
      } else {
        throw e;
      }
    }
  });
});
