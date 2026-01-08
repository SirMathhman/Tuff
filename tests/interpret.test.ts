import { describe, it, expect } from "vitest";
import { interpret } from "../src/interpret";
import { evaluateReturningOperand } from "../src/eval";
import { interpretAll } from "../src/interpret_helpers";
import type { Env } from "../src/env";
import { isPlainObject, isStructInstance, isThisBinding } from "../src/types";

describe("interpret (basic behavior)", () => {
  it("returns a number for any input", () => {
    const result = interpret("anything");
    expect(typeof result).toBe("number");
  });

  it("parses numeric strings and returns 0 for non-numeric strings", () => {
    expect(interpret("")).toBe(0);
    expect(interpret("42")).toBe(42);
    expect(interpret("hello world")).toBe(0);
  });

  it("handles the user-provided case '100' => 100", () => {
    expect(interpret("100")).toBe(100);
  });

  it("handles suffixes like 'U8' (e.g., '100U8' => 100)", () => {
    expect(interpret("100U8")).toBe(100);
    expect(interpret("100u8")).toBe(100);
  });

  it("throws for out-of-range unsigned values (e.g., '256U8')", () => {
    expect(() => interpret("256U8")).toThrow();
  });

  it("accepts max unsigned values (e.g., '255U8' => 255)", () => {
    expect(interpret("255U8")).toBe(255);
    expect(interpret("0U8")).toBe(0);
  });

  it("handles U16, U32 boundaries", () => {
    expect(interpret("65535U16")).toBe(65535);
    expect(() => interpret("65536U16")).toThrow();

    expect(interpret("4294967295U32")).toBe(4294967295);
    expect(() => interpret("4294967296U32")).toThrow();
  });

  it("handles U64 boundaries (accepts in-range, throws out-of-range)", () => {
    // 2^64-1 = 18446744073709551615
    expect(typeof interpret("18446744073709551615U64")).toBe("number");
    expect(() => interpret("18446744073709551616U64")).toThrow();
  });

  it("handles signed I8/I16/I32 boundaries", () => {
    expect(interpret("-128I8")).toBe(-128);
    expect(() => interpret("-129I8")).toThrow();
    expect(interpret("127I8")).toBe(127);
    expect(() => interpret("128I8")).toThrow();

    expect(interpret("-32768I16")).toBe(-32768);
    expect(() => interpret("-32769I16")).toThrow();
    expect(interpret("32767I16")).toBe(32767);
    expect(() => interpret("32768I16")).toThrow();

    expect(interpret("-2147483648I32")).toBe(-2147483648);
    expect(() => interpret("-2147483649I32")).toThrow();
    expect(interpret("2147483647I32")).toBe(2147483647);
    expect(() => interpret("2147483648I32")).toThrow();
  });

  it("handles I64 boundaries (accepts in-range, throws out-of-range)", () => {
    // min = -2^63 = -9223372036854775808
    expect(typeof interpret("-9223372036854775808I64")).toBe("number");
    expect(() => interpret("-9223372036854775809I64")).toThrow();
  });

  it("throws for negative numbers with suffixes (e.g., '-100U8')", () => {
    expect(() => interpret("-100U8")).toThrow();
  });

  it("parses negative numbers without suffixes (e.g., '-100' => -100)", () => {
    expect(interpret("-100")).toBe(-100);
  });

  it("evaluates simple addition of suffixed integers (e.g., '1U8 + 2U8' => 3)", () => {
    expect(interpret("1U8 + 2U8")).toBe(3);
  });

  it("evaluates chained addition of suffixed integers (e.g., '1U8 + 2U8 + 3U8' => 6)", () => {
    expect(interpret("1U8 + 2U8 + 3U8")).toBe(6);
  });

  it("handles mixed suffixed and unsuffixed addition (e.g., '1U8 + 2' => 3)", () => {
    expect(interpret("1U8 + 2")).toBe(3);
    expect(interpret("2 + 1U8")).toBe(3);
  });

  it("throws when mixed suffixed addition overflows (e.g., '1U8 + 255' => Error)", () => {
    expect(() => interpret("1U8 + 255")).toThrow();
    expect(() => interpret("255 + 1U8")).toThrow();
  });

  it("accepts mixed suffixed addition when sum fits (e.g., '1U8 + 254' => 255)", () => {
    expect(interpret("1U8 + 254")).toBe(255);
    expect(interpret("254 + 1U8")).toBe(255);
  });

  it("throws when adding operands with mismatched suffixes (e.g., '5U8 + 4U16')", () => {
    expect(() => interpret("5U8 + 4U16")).toThrow();
    expect(() => interpret("4U16 + 5U8")).toThrow();
  });

  it("handles subtraction with mixed suffixed/unsuffixed operands (e.g., '5 - 4U8' => 1)", () => {
    expect(interpret("5 - 4U8")).toBe(1);
    expect(interpret("5U8 - 4")).toBe(1);
  });

  it("throws when subtraction underflows unsigned range (e.g., '4 - 5U8')", () => {
    expect(() => interpret("4 - 5U8")).toThrow();
    expect(() => interpret("4U8 - 5")).toThrow();
  });

  it("handles multiplication with suffixed and unsuffixed operands (e.g., '2U8 * 3' => 6)", () => {
    expect(interpret("2U8 * 3")).toBe(6);
    expect(interpret("3 * 2U8")).toBe(6);
  });

  it("throws on overflow for multiplication (e.g., '2U8 * 128' => Error)", () => {
    expect(() => interpret("2U8 * 128")).toThrow();
    expect(() => interpret("128 * 2U8")).toThrow();
  });

  it("evaluates mixed operator expressions left-associatively (e.g., '5 * 3 + 1' => 16)", () => {
    expect(interpret("5 * 3 + 1")).toBe(16);
  });

  it("respects operator precedence ('1 + 5 * 3' => 16)", () => {
    expect(interpret("1 + 5 * 3")).toBe(16);
  });

  it("handles parentheses and respects grouping ('(1 + 5) * 3' => 18)", () => {
    expect(interpret("(1 + 5) * 3")).toBe(18);
  });

  it("handles braces and respects grouping ('1 + { 10 } % 3' => 2)", () => {
    expect(interpret("1 + { 10 } % 3")).toBe(2);
  });

  it("handles blocks with let and returns last expression ('1 + { let x : 10I32 = 10I32; x } % 3' => 2)", () => {
    expect(interpret("1 + { let x : 10I32 = 10I32; x } % 3")).toBe(2);
  });

  it("throws when annotation doesn't match initializer ('1 + { let x : 1I32 = 10I32; x } % 3' => Error)", () => {
    expect(() => interpret("1 + { let x : 1I32 = 10I32; x } % 3")).toThrow();
  });

  it("accepts type-only annotation ('1 + { let x : I32 = 10I32; x } % 3' => 2)", () => {
    expect(interpret("1 + { let x : I32 = 10I32; x } % 3")).toBe(2);
  });

  it("accepts unannotated let ('1 + { let x = 10I32; x } % 3' => 2)", () => {
    expect(interpret("1 + { let x = 10I32; x } % 3")).toBe(2);
  });

  it("accepts unannotated plain integer let ('1 + { let x = 10; x } % 3' => 2)", () => {
    expect(interpret("1 + { let x = 10; x } % 3")).toBe(2);
  });

  it("evaluates block returning expression ('{ let x = 10; let y = 20; x + y }' => 30)", () => {
    expect(interpret("{ let x = 10; let y = 20; x + y }")).toBe(30);
  });

  it("evaluates top-level statements ('let x = 10; let y = 20; x + y' => 30)", () => {
    expect(interpret("let x = 10; let y = 20; x + y")).toBe(30);
  });

  it("throws on duplicate declaration in same scope ('let x = 10; let x = 20;' => Error)", () => {
    expect(() => interpret("let x = 10; let x = 20;")).toThrow();
  });

  it("throws on duplicate declaration in block ('{ let x = 10; let x = 20; }' => Error)", () => {
    expect(() => interpret("{ let x = 10; let x = 20; }")).toThrow();
  });

  it("throws when initializer identifier doesn't match annotation ('let x = 10; let y : 20I32 = x;' => Error)", () => {
    expect(() => interpret("let x = 10; let y : 20I32 = x;")).toThrow();
  });

  it("throws when initializer identifier doesn't match annotation in block ('{ let x = 10; let y : 20I32 = x; }' => Error)", () => {
    expect(() => interpret("{ let x = 10; let y : 20I32 = x; }")).toThrow();
  });

  it("accepts initializer identifier matching annotated literal ('let x = 20; let y : 20I32 = x; x' => 20)", () => {
    expect(interpret("let x = 20; let y : 20I32 = x; x")).toBe(20);
  });

  it("accepts initializer identifier matching annotated literal in block ('{ let x = 20; let y : 20I32 = x; x }' => 20)", () => {
    expect(interpret("{ let x = 20; let y : 20I32 = x; x }")).toBe(20);
  });

  it("allows unrelated statements between declarations ('let x = 20; let z = 0; let y : 20I32 = x; x' => 20)", () => {
    expect(interpret("let x = 20; let z = 0; let y : 20I32 = x; x")).toBe(20);
  });

  it("supports declaration-only annotated let followed by assignment ('let x : 1I32; x = 1; x' => 1)", () => {
    expect(interpret("let x : 1I32; x = 1; x")).toBe(1);
  });

  it("supports address-of and dereference ('let x = 100; let y : *I32 = &x; *y' => 100)", () => {
    expect(interpret("let x = 100; let y : *I32 = &x; *y")).toBe(100);
  });

  it("throws on reassigning annotated literal ('let x : 1I32; x = 1; x = 2; x' => Error)", () => {
    expect(() => interpret("let x : 1I32; x = 1; x = 2; x")).toThrow();
  });

  it("allows reassign when declared mutable ('let mut x : I32; x = 1; x = 2; x' => 2)", () => {
    expect(interpret("let mut x : I32; x = 1; x = 2; x")).toBe(2);
  });

  it("allows reassign when declared mutable with literal annotation ('let mut x : 1I32; x = 1; x = 2; x' => 2)", () => {
    expect(interpret("let mut x : 1I32; x = 1; x = 2; x")).toBe(2);
  });
  it("handles while loops and compound assignment ('let mut x = 0; while (x < 4) x += 1; x' => 4)", () => {
    expect(interpret("let mut x = 0; while (x < 4) x += 1; x")).toBe(4);
  });
  it("handles while with braced body ('let mut x = 0; while (x < 4) { x += 1; }; x' => 4)", () => {
    expect(interpret("let mut x = 0; while (x < 4) { x += 1; }; x")).toBe(4);
  });
  it("throws when assigning a statement-only block to a variable ('let x = { let y = 20; }; x' => Error)", () => {
    expect(() => interpret("let x = { let y = 20; }; x")).toThrow();
    expect(() => interpret("{ let x = { let y = 20; }; x }")).toThrow();
  });

  it("accepts initializer block with final expression ('let x = { let y = 20; y }; x' => 20)", () => {
    expect(interpret("let x = { let y = 20; y }; x")).toBe(20);
    expect(interpret("{ let x = { let y = 20; y }; x }")).toBe(20);
  });

  it("handles empty block between statements ('let x = 10; {} x' => 10)", () => {
    expect(interpret("let x = 10; {} x")).toBe(10);
    // also inside an outer block
    expect(interpret("{ let x = 10; {} x } ")).toBe(10);
  });

  it("handles braced expression after a statement ('let x = 10; { x }' => 10)", () => {
    expect(interpret("let x = 10; { x }")).toBe(10);
    // also when nested in an outer block
    expect(interpret("{ let x = 10; { x } } ")).toBe(10);
  });

  it("handles inner block using outer binding ('let x = 10; { let y = x; y }' => 10)", () => {
    expect(interpret("let x = 10; { let y = x; y }")).toBe(10);
    expect(interpret("{ let x = 10; { let y = x; y } } ")).toBe(10);
  });

  it("handles logical OR between booleans ('let x = true; let y = false; x || y' => 1)", () => {
    expect(interpret("let x = true; let y = false; x || y")).toBe(1);
    expect(interpret("let x = false; let y = false; x || y")).toBe(0);
    expect(interpret("true || false")).toBe(1);
    expect(interpret("false || false")).toBe(0);
  });

  it("handles numeric comparison ('let x = 1; let y = 2; x < y' => 1)", () => {
    expect(interpret("let x = 1; let y = 2; x < y")).toBe(1);
    expect(interpret("let x = 2; let y = 1; x < y")).toBe(0);
    expect(interpret("1 < 2")).toBe(1);
    expect(interpret("2 <= 2")).toBe(1);
    expect(interpret("3 >= 4")).toBe(0);
    expect(interpret("3 == 3")).toBe(1);
    expect(interpret("3 != 3")).toBe(0);
  });

  it("throws for referencing inner block binding outside its block ('{ let x = 10; } x' => Error)", () => {
    expect(() => interpret("{ let x = 10; } x")).toThrow();
    expect(() => interpret("{ { let x = 10; } x } ")).toThrow();
  });

  it("resolves identifier inside a braced block using provided env", () => {
    expect(interpret("{ x }", { x: 10 })).toBe(10);
    expect(interpret("{ x }", { x: { valueBig: 10n } })).toBe(10);
    // booleans in env
    expect(interpret("{ x }", { x: { boolValue: true } })).toBe(1);
  });

  it("handles Bool annotations and boolean literals ('let x : Bool = true; x' => 1)", () => {
    expect(interpret("let x : Bool = true; x")).toBe(1);
    expect(interpret("let x : Bool = false; x")).toBe(0);
    expect(interpret("let x = true; x")).toBe(1);
  });

  it("returns 0 for let-only sequences ('let x = 10;' => 0)", () => {
    expect(interpret("let x = 10;")).toBe(0);
    expect(interpret("{ let x = 10; }")).toBe(0);
  });

  it("handles division and respects precedence ('1 + 10 / 2' => 6)", () => {
    expect(interpret("1 + 10 / 2")).toBe(6);
  });

  it("handles modulus and respects precedence ('1 + 10 % 3' => 2)", () => {
    expect(interpret("1 + 10 % 3")).toBe(2);
  });

  it("throws when multiplying unsigned by a negative number (e.g., '2U8 * -1' => Error)", () => {
    expect(() => interpret("2U8 * -1")).toThrow();
    expect(() => interpret("-1 * 2U8")).toThrow();
  });

  it("supports simple match expressions ('let result = match (100) { case 100 => 4; case 2 => 3; default => 50; } result' => 4)", () => {
    expect(
      interpret(
        "let result = match (100) { case 100 => 4; case 2 => 3; default => 50; } result"
      )
    ).toBe(4);
  });

  it("supports match expression as standalone ('match (100) { case 100 => 4 }' => 4)", () => {
    expect(interpret("match (100) { case 100 => 4 }")).toBe(4);
  });

  it("supports simple fn definitions and calls ('fn get() => 100; get()' => 100)", () => {
    expect(interpret("fn get() => 100; get()")).toBe(100);
  });

  it("supports simple param annotation ('fn pass(value : I32) => value; pass(100)' => 100)", () => {
    expect(interpret("fn pass(value : I32) => value; pass(100)")).toBe(100);
  });

  it("allows functions to call other functions ('fn a() => 100; fn b() => a(); b()' => 100)", () => {
    expect(interpret("fn a() => 100; fn b() => a(); b()")).toBe(100);
  });

  it("mutates outer mutable variable from function ('let mut x = 0; fn add() => { x += 1; } add(); x' => 1)", () => {
    expect(interpret("let mut x = 0; fn add() => { x += 1; } add(); x")).toBe(
      1
    );
  });

  it("supports functions with multiple named annotated params ('fn add(first : I32, second : I32) => first + second; add(1, 2)' => 3)", () => {
    expect(
      interpret(
        "fn add(first : I32, second : I32) => first + second; add(1, 2)"
      )
    ).toBe(3);
  });

  it("supports functions with annotated result ('fn add(first : I32, second : I32) : I32 => first + second; add(1, 2)' => 3)", () => {
    expect(
      interpret(
        "fn add(first : I32, second : I32) : I32 => first + second; add(1, 2)"
      )
    ).toBe(3);
  });

  it("throws when declaring same fn twice without separators ('fn empty() => {} fn empty() => {}' => Error)", () => {
    expect(() => interpret("fn empty() => {} fn empty() => {}")).toThrow();
  });

  it("supports inline fn expressions assigned to variables ('let myFunc = fn get() => 100; myFunc()' => 100)", () => {
    expect(interpret("let myFunc = fn get() => 100; myFunc()")).toBe(100);
  });

  it("supports recursive function calls ('fn fact(n) => if (n <= 1) 1 else n * fact(n - 1); fact(5)' => 120)", () => {
    expect(
      interpret("fn fact(n) => if (n <= 1) 1 else n * fact(n - 1); fact(5)")
    ).toBe(120);
  });

  it("supports closures that capture values ('fn capture(value : I32) => fn get() => value; let getter = capture(100); getter()' => 100)", () => {
    expect(
      interpret(
        "fn capture(value : I32) => fn get() => value; let getter = capture(100); getter()"
      )
    ).toBe(100);
  });

  it("supports curried functions with closure capture ('fn outer(first : I32) => fn inner(second : I32) => first + second; outer(3)(4)' => 7)", () => {
    expect(
      interpret(
        "fn outer(first : I32) => fn inner(second : I32) => first + second; outer(3)(4)"
      )
    ).toBe(7);
  });

  it("returns 'this' from a function used as constructor ('fn Wrapper(value : I32) => this; Wrapper(100).value' => 100)", () => {
    expect(
      interpret("fn Wrapper(value : I32) => this; Wrapper(100).value")
    ).toBe(100);
  });

  it("supports methods on returned `this` that capture parameters ('fn Point(x : I32, y : I32) => { fn manhattan() => x + y; this } Point(3, 4).manhattan()' => 7)", () => {
    expect(
      interpret(
        "fn Point(x : I32, y : I32) => { fn manhattan() => x + y; this } Point(3, 4).manhattan()"
      )
    ).toBe(7);
  });

  it("(debug) constructor returns this binding object for direct call", () => {
    const env: Env = {};
    interpret(
      "fn Point(x : I32, y : I32) => { fn manhattan() => x + y; this }",
      env
    );
    const obj = evaluateReturningOperand("Point(3, 4)", env);
    expect(isThisBinding(obj) || isStructInstance(obj)).toBeTruthy();
    if (isThisBinding(obj) || isStructInstance(obj)) {
      expect(isPlainObject(obj.fieldValues) && obj.fieldValues.manhattan).toBeTruthy();
    }
  });

  it("handles empty struct definition ('struct Empty {}' => 0)", () => {
    expect(interpret("struct Empty {}")).toBe(0);
  });

  it("handles struct with field access ('struct Wrapper { value : I32 } Wrapper { value : 100 }.value' => 100)", () => {
    expect(
      interpret("struct Wrapper { value : I32 } Wrapper { value : 100 }.value")
    ).toBe(100);
  });

  it("handles struct with multiple fields ('struct Point { x : I32, y : I32 } Point { x : 10, y : 20 }.x' => 10)", () => {
    expect(
      interpret("struct Point { x : I32, y : I32 } Point { x : 10, y : 20 }.x")
    ).toBe(10);
  });

  it("handles struct field access with expressions ('struct Point { x : I32, y : I32 } Point { x : 5 + 5, y : 15 + 5 }.y' => 20)", () => {
    expect(
      interpret(
        "struct Point { x : I32, y : I32 } Point { x : 5 + 5, y : 15 + 5 }.y"
      )
    ).toBe(20);
  });

  it("handles this binding for variable access ('let x = 100; this.x' => 100)", () => {
    expect(interpret("let x = 100; this.x")).toBe(100);
  });

  it("handles this binding for variable assignment ('let mut x = 100; this.x = 200; x' => 200)", () => {
    expect(interpret("let mut x = 100; this.x = 200; x")).toBe(200);
  });

  it("constructors return separate 'this' instances and allow arithmetic ('fn Wrapper(value : I32) => this; Wrapper(3).value + Wrapper(4).value' => 7)", () => {
    expect(
      interpret(
        "fn Wrapper(value : I32) => this; Wrapper(3).value + Wrapper(4).value"
      )
    ).toBe(7);
  });

  it("interpretAll executes single-script map and returns numeric result", () => {
    expect(interpretAll({ main: "1 + 2" }, "main")).toBe(3);
  });

  it("interpretAll imports from other namespace via 'from .. use' and calls exported function", () => {
    expect(
      interpretAll(
        { main: "from lib use { get }; get()", lib: "out fn get() => 100;" },
        "main"
      )
    ).toBe(100);
  });

  it("interpretAll throws when importing a missing namespace", () => {
    expect(() =>
      interpretAll(
        { main: "from missing use { a }; a()", lib: "out fn a() => 1;" },
        "main"
      )
    ).toThrow("namespace not found");
  });

  it("interpretAll throws when importing from unknown namespace 'blah'", () => {
    expect(() =>
      interpretAll(
        { main: "from blah use { get }; get()", lib: "out fn get() => 100;" },
        "main"
      )
    ).toThrow("namespace not found");
  });

  it("interpretAll throws when importing a missing symbol", () => {
    expect(() =>
      interpretAll(
        {
          main: "from lib use { missing }; missing()",
          lib: "out fn a() => 1;",
        },
        "main"
      )
    ).toThrow("symbol not found in namespace");
  });

  it("interpretAll throws when importing a non-exported symbol 'foo'", () => {
    expect(() =>
      interpretAll(
        { main: "from lib use { foo }; foo()", lib: "fn get() => 100;" },
        "main"
      )
    ).toThrow("symbol not found in namespace");
  });

  it("interpretAll throws when importing a non-exported symbol 'get'", () => {
    expect(() =>
      interpretAll(
        { main: "from lib use { get }; get()", lib: "fn get() => 100;" },
        "main"
      )
    ).toThrow("symbol not found in namespace");
  });

  it("interpretAll throws when main namespace is missing", () => {
    expect(() =>
      interpretAll(
        { main: "from lib use { get }; get()", lib: "out fn get() => 100;" },
        "somethingElse"
      )
    ).toThrow("main namespace not found");
  });

  it("interpretAll returns 0 when main namespace is lib and lib only declares a function", () => {
    expect(
      interpretAll(
        { main: "from lib use { get }; get()", lib: "fn get() => 100;" },
        "lib"
      )
    ).toBe(0);
  });
});
