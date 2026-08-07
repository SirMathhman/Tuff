import { expect, test } from "bun:test";
import {
  expectValid,
  expectInvalid,
  expectModules,
  compileToExports,
} from "./test/helpers";

test('evaluate("") => 0', () => {
  expectValid("", 0);
});

test('evaluateModules(["main"], {["main"] : "100"}) => 100', () => {
  expectModules(["main"], { main: "100" }, 100);
});

test('evaluateModules(["main"], {["main"] : "lib.x", ["lib"] : "out let x = 100;"}) => 100', () => {
  expectModules(["main"], { main: "lib.x", lib: "out let x = 100;" }, 100);
});

test('evaluateModules(["main"], {["main"] : "lib.get()", ["lib"] : "out fn get() => 100;"}) => 100', () => {
  expectModules(
    ["main"],
    { main: "lib.get()", lib: "out fn get() => 100;" },
    100,
  );
});

test('evaluateModules(["main"], {["main"] : "lib::foo.get()", ["lib", "foo"] : "out fn get() => 100;"}) => 100', () => {
  expectModules(
    ["main"],
    { main: "lib::foo.get()", "lib::foo": "out fn get() => 100;" },
    100,
  );
});

test('evaluateModules(["main"], {["main"] : "lib { x : 100 }.y", ["lib"] : "in let x : I32; out let y = x;"}) => 100', () => {
  expectModules(
    ["main"],
    { main: "lib { x : 100 }.y", lib: "in let x : I32; out let y = x;" },
    100,
  );
});

test('evaluate(" ") => 0', () => {
  expectValid(" ", 0);
});

test('evaluate("1") => 1', () => {
  expectValid("1", 1);
});

test('evaluate("100U8") => 100', () => {
  expectValid("100U8", 100);
});

test('evaluate("256U8") => Error', () => {
  expectInvalid("256U8");
});

test('evaluate("-100U8") => Error', () => {
  expectInvalid("-100U8");
});

test('evaluate("let x : U8 = 256;") => Error', () => {
  expectInvalid("let x : U8 = 256;");
});

test('evaluate("let x : U8 = 1U8; x") => 1', () => {
  expectValid("let x : U8 = 1U8; x", 1);
});

test('evaluate("let x : U16 = 1U8; x") => 1', () => {
  expectValid("let x : U16 = 1U8; x", 1);
});

test('evaluate("let x : U8 = 1U16; x") => Error', () => {
  expectInvalid("let x : U8 = 1U16; x");
});

test('evaluate("1 + 2") => 3', () => {
  expectValid("1 + 2", 3);
});

test('evaluate("1 + 2 + 3") => 6', () => {
  expectValid("1 + 2 + 3", 6);
});

test('evaluate("2 + 3 - 1") => 4', () => {
  expectValid("2 + 3 - 1", 4);
});

test('evaluate("2 * 3 + 4") => 10', () => {
  expectValid("2 * 3 + 4", 10);
});

test('evaluate("2 + 3 * 4") => 14', () => {
  expectValid("2 + 3 * 4", 14);
});

test('evaluate("(2 + 3) * 4") => 20', () => {
  expectValid("(2 + 3) * 4", 20);
});

test('evaluate("{ 2 + 3 } * 4") => 20', () => {
  expectValid("{ 2 + 3 } * 4", 20);
});

test('evaluate("{ let x = 2 + 3; x } * 4") => 20', () => {
  expectValid("{ let x = 2 + 3; x } * 4", 20);
});

test('evaluate("let y = { let x = 2 + 3; x } * 4; y") => 20', () => {
  expectValid("let y = { let x = 2 + 3; x } * 4; y", 20);
});

test('evaluate("let x = 0; let x = 1; x") => 1', () => {
  expectValid("let x = 0; let x = 1; x", 1);
});

test('evaluate("let x = { let y = 100; }; x") => Error', () => {
  expectInvalid("let x = { let y = 100; }; x");
});

test('evaluate("let mut x = 0; x = 1; x") => 1', () => {
  expectValid("let mut x = 0; x = 1; x", 1);
});

test('evaluate("let x = true; x") => 1', () => {
  expectValid("let x = true; x", 1);
});

test('evaluate("let x : Bool = true; x") => 1', () => {
  expectValid("let x : Bool = true; x", 1);
});

test('evaluate("let array : [I32; 3] = [1, 2, 3];") => 0', () => {
  expectValid("let array : [I32; 3] = [1, 2, 3];", 0);
});

test('evaluate("let array : [[I32; 2]; 2] = [[0, 1], [2, 3]];") => 0', () => {
  expectValid("let array : [[I32; 2]; 2] = [[0, 1], [2, 3]];", 0);
});

test('evaluate("let x = false; x") => 0', () => {
  expectValid("let x = false; x", 0);
});

test('evaluate("let x = 2; let y = 2; x == y") => 1', () => {
  expectValid("let x = 2; let y = 2; x == y", 1);
});

test('evaluate("true == 1") => 0', () => {
  expectValid("true == 1", 0);
});

test('evaluate("let x = true; let y = false; x || y") => 1', () => {
  expectValid("let x = true; let y = false; x || y", 1);
});

test('evaluate("let x = true; let y = false; x && y") => 0', () => {
  expectValid("let x = true; let y = false; x && y", 0);
});

test('evaluate("1 < 2") => 1', () => {
  expectValid("1 < 2", 1);
});

test('evaluate("2 < 1") => 0', () => {
  expectValid("2 < 1", 0);
});

test('evaluate("1 <= 1") => 1', () => {
  expectValid("1 <= 1", 1);
});

test('evaluate("2 <= 1") => 0', () => {
  expectValid("2 <= 1", 0);
});

test('evaluate("2 > 1") => 1', () => {
  expectValid("2 > 1", 1);
});

test('evaluate("1 > 2") => 0', () => {
  expectValid("1 > 2", 0);
});

test('evaluate("1 >= 1") => 1', () => {
  expectValid("1 >= 1", 1);
});

test('evaluate("1 >= 2") => 0', () => {
  expectValid("1 >= 2", 0);
});

test('evaluate("1 != 2") => 1', () => {
  expectValid("1 != 2", 1);
});

test('evaluate("1 != 1") => 0', () => {
  expectValid("1 != 1", 0);
});

test('evaluate("let x = true; !x") => 0', () => {
  expectValid("let x = true; !x", 0);
});

test('evaluate("let x = 100; -x") => -100', () => {
  expectValid("let x = 100; -x", -100);
});

test('evaluate("let x = if (false) 2 else 3; x") => 3', () => {
  expectValid("let x = if (false) 2 else 3; x", 3);
});

test('evaluate("let x = if (false) 2 else if (false) 3 else 4; x") => 4', () => {
  expectValid("let x = if (false) 2 else if (false) 3 else 4; x", 4);
});

test('evaluate("let mut x = 0; { x = 1; } x") => 1', () => {
  expectValid("let mut x = 0; { x = 1; } x", 1);
});

test('evaluate("let mut x = 0; if (false) { x = 1; } else { x = 2; } x") => 2', () => {
  expectValid("let mut x = 0; if (false) { x = 1; } else { x = 2; } x", 2);
});

test('evaluate("let mut x = 0; if (false) x = 1; else x = 2; x") => 2', () => {
  expectValid("let mut x = 0; if (false) x = 1; else x = 2; x", 2);
});

test('evaluate("let mut x = 1; x += 2; x") => 3', () => {
  expectValid("let mut x = 1; x += 2; x", 3);
});

test('evaluate("let mut x = 0; while (x < 4) { x += 1; } x") => 4', () => {
  expectValid("let mut x = 0; while (x < 4) { x += 1; } x", 4);
});

test('evaluate("let mut x = 0; while (x < 4) { x += 1; continue; } x") => 4', () => {
  expectValid("let mut x = 0; while (x < 4) { x += 1; continue; } x", 4);
});

test('evaluate("let mut x = 0; while (x < 4) { x += 1; break; } x") => 1', () => {
  expectValid("let mut x = 0; while (x < 4) { x += 1; break; } x", 1);
});

test('evaluate("let mut x = 0; while (x < 4) x += 1; x") => 4', () => {
  expectValid("let mut x = 0; while (x < 4) x += 1; x", 4);
});

test('evaluate("let mut x = 0; if (true) x = 4; x") => 4', () => {
  expectValid("let mut x = 0; if (true) x = 4; x", 4);
});

test('"apple"[0]" => 97', () => {
  expectValid('"apple"[0]', 97);
});

test('evaluate("let str : &Str = "apple"; str[0]") => 97', () => {
  expectValid('let str : &Str = "apple"; str[0]', 97);
});

test('"apple".length" => 5', () => {
  expectValid('"apple".length', 5);
});

test('"test" == "test" => 1', () => {
  expectValid('"test" == "test"', 1);
});

test('"apple" < "banana" => 1', () => {
  expectValid('"apple" < "banana"', 1);
});

test("fn get() => { if (true) yield 1; 2 } + 3; get() => 4", () => {
  expectValid("fn get() => { if (true) yield 1; 2 } + 3; get()", 4);
});

test("let array = [100]; let array0 = [array]; let temp = array0[0]; temp[0] => 100", () => {
  expectValid(
    "let array = [100]; let array0 = [array]; let temp = array0[0]; temp[0]",
    100,
  );
});

test("let array0 = [[100]]; array0[0][0] => 100", () => {
  expectValid("let array0 = [[100]]; array0[0][0]", 100);
});

test("fn get() => { if (true) return 1; 2 } + 3; get() => 1", () => {
  expectValid("fn get() => { if (true) return 1; 2 } + 3; get()", 1);
});

test("let mut x = 0; fn doNothing() => { if (true) return; x += 1; } doNothing(); x => 0", () => {
  expectValid(
    "let mut x = 0; fn doNothing() => { if (true) return; x += 1; } doNothing(); x",
    0,
  );
});

test("let pt = { x : 3, y : 4 }; pt.x + pt.y => 7", () => {
  expectValid("let pt = { x : 3, y : 4 }; pt.x + pt.y", 7);
});

test("struct Point { x : I32, y : I32 } let pt : Point = Point { x : 3, y : 4 }; pt.x + pt.y => 7", () => {
  expectValid(
    "struct Point { x : I32, y : I32 } let pt : Point = Point { x : 3, y : 4 }; pt.x + pt.y",
    7,
  );
});

test("enum Color { Red, Green, Blue } Color::Red == Color::Red && Color::Red != 0 => 1", () => {
  expectValid(
    "enum Color { Red, Green, Blue } Color::Red == Color::Red && Color::Red != 0",
    1,
  );
});

test("let pt : { x : I32, y : I32 } = { x : 3, y : 4 }; pt.x + pt.y => 7", () => {
  expectValid(
    "let pt : { x : I32, y : I32 } = { x : 3, y : 4 }; pt.x + pt.y",
    7,
  );
});

test("let mut array = [0]; array[0] = 100; array[0] => 100", () => {
  expectValid("let mut array = [0]; array[0] = 100; array[0]", 100);
});

test('evaluate("let x = { if (true) yield 4; 0 }; x") => 4', () => {
  expectValid("let x = { if (true) yield 4; 0 }; x", 4);
});

test('evaluate("fn add(x : I32, y : I32) => x + y; add(3, 4)") => 7', () => {
  expectValid("fn add(x : I32, y : I32) => x + y; add(3, 4)", 7);
});

test('evaluate("fn pass<T>(value : T) => value; pass(100)") => 100', () => {
  expectValid("fn pass<T>(value : T) => value; pass(100)", 100);
});

test('evaluate("fn pass<T>(value : T) : T => value; pass(100)") => 100', () => {
  expectValid("fn pass<T>(value : T) : T => value; pass(100)", 100);
});

test('evaluate("fn get() : U8 => 100U16;") => Error', () => {
  expectInvalid("fn get() : U8 => 100U16;");
});

test('evaluate("fn get() : U16 => 100U8;") => 0', () => {
  expectValid("fn get() : U16 => 100U8;", 0);
});

test('evaluate("fn doNothing(param) => {}") => Error', () => {
  expectInvalid("fn doNothing(param) => {}");
});

test('evaluate("fn doNothing(param : I32) => {}") => 0', () => {
  expectValid("fn doNothing(param : I32) => {}", 0);
});

test('evaluate("fn doNothing(param : U8) => {} doNothing(100U16)") => Error', () => {
  expectInvalid("fn doNothing(param : U8) => {} doNothing(100U16)");
});

test('evaluate("fn add(x : I32, y : I32) => { x + y } add(3, 4)") => 7', () => {
  expectValid("fn add(x : I32, y : I32) => { x + y } add(3, 4)", 7);
});

test('evaluate("let mut x = 0; fn addOnce() => { x += 1; } addOnce(); x") => 1', () => {
  expectValid("let mut x = 0; fn addOnce() => { x += 1; } addOnce(); x", 1);
});

test('evaluate("let x = 100; let y = &x; *y") => 100', () => {
  expectValid("let x = 100; let y = &x; *y", 100);
});

test('evaluate("let x = 100; let y : &I32 = &x; *y") => 100', () => {
  expectValid("let x = 100; let y : &I32 = &x; *y", 100);
});

test('evaluate("let array = [1, 2, 3]; let ptr : &[I32; 3] = &array; ptr[0] + ptr[1] + ptr[2]") => 6', () => {
  expectValid(
    "let array = [1, 2, 3]; let ptr : &[I32; 3] = &array; ptr[0] + ptr[1] + ptr[2]",
    6,
  );
});

test('evaluate("let array = [1, 2, 3]; let ptr : &[I32] = &array; ptr[0] + ptr[1] + ptr[2]") => 6', () => {
  expectValid(
    "let array = [1, 2, 3]; let ptr : &[I32] = &array; ptr[0] + ptr[1] + ptr[2]",
    6,
  );
});

test('evaluate("let mut x = 0; let y = &mut x; *y = 100;  x") => 100', () => {
  expectValid("let mut x = 0; let y = &mut x; *y = 100;  x", 100);
});

test('evaluate("let tuple = (3, 4); tuple.0 + tuple.1") => 7', () => {
  expectValid("let tuple = (3, 4); tuple.0 + tuple.1", 7);
});

test('evaluate("let tuple : (I32, I32) = (3, 4); tuple.0 + tuple.1") => 7', () => {
  expectValid("let tuple : (I32, I32) = (3, 4); tuple.0 + tuple.1", 7);
});

test('evaluate("fn get() => 100; let func = get; func()") => 100', () => {
  expectValid("fn get() => 100; let func = get; func()", 100);
});

test('evaluate("let mut sum = 0; for (i in 0..4) sum += i; sum") => 6', () => {
  expectValid("let mut sum = 0; for (i in 0..4) sum += i; sum", 6);
});

test('evaluate("let x = match (1) { case 1 => 2; case _ => 3; }; x") => 2', () => {
  expectValid("let x = match (1) { case 1 => 2; case _ => 3; }; x", 2);
});

test('evaluate("let x = match (4) { case 1 => 2; case _ => 3; }; x") => 3', () => {
  expectValid("let x = match (4) { case 1 => 2; case _ => 3; }; x", 3);
});

test('evaluate("let x = null; x") => 0', () => {
  expectValid("let x = null; x", 0);
});

test('evaluate("let array = [1, 2, 3]; array[0] + array[1] + array[2]") => 6', () => {
  expectValid("let array = [1, 2, 3]; array[0] + array[1] + array[2]", 6);
});

test("'a' => 97", () => {
  expectValid("'a'", 97);
});

test("'\\n' => 10", () => {
  expectValid("'\\n'", 10);
});

test('evaluate("let array = [1, 2, 3]; array.length") => 3', () => {
  expectValid("let array = [1, 2, 3]; array.length", 3);
});

test('evaluate("fn factorial(n : I32) => if (n <= 1) 1 else n * factorial(n - 1); factorial(5)") => 120', () => {
  expectValid(
    "fn factorial(n : I32) => if (n <= 1) 1 else n * factorial(n - 1); factorial(5)",
    120,
  );
});

test('evaluate("10 % 3") => 1', () => {
  expectValid("10 % 3", 1);
});

test('evaluate("let mut x = 0; x -= 1; x") => -1', () => {
  expectValid("let mut x = 0; x -= 1; x", -1);
});

test('evaluate("100U8 is U8") => 1', () => {
  expectValid("100U8 is U8", 1);
});

test('evaluate("let x = 100U8; x is U8") => 1', () => {
  expectValid("let x = 100U8; x is U8", 1);
});

test('evaluate("100U8 is I32") => 0', () => {
  expectValid("100U8 is I32", 0);
});

test('evaluate("let x = 5; x is U8") => 0', () => {
  expectValid("let x = 5; x is U8", 0);
});

test('evaluate("let x : U8 = 5; x is U8") => 1', () => {
  expectValid("let x : U8 = 5; x is U8", 1);
});

test('evaluate("let value : Bool | I32 = 100; value is I32") => 1', () => {
  expectValid("let value : Bool | I32 = 100; value is I32", 1);
});

test('evaluate("true is bool") => 1', () => {
  expectValid("true is bool", 1);
});

test('evaluate("1 is bool") => 0', () => {
  expectValid("1 is bool", 0);
});

test('evaluate("' + '"hello"' + ' is string") => 1', () => {
  expectValid('"hello" is string', 1);
});

test('evaluate("(1, 2) is tuple") => 1', () => {
  expectValid("(1, 2) is tuple", 1);
});

test('evaluate("[1, 2] is array") => 1', () => {
  expectValid("[1, 2] is array", 1);
});

test('evaluate("null is null") => 1', () => {
  expectValid("null is null", 1);
});

test('evaluate("let x = { a : 1 }; x is record") => 1', () => {
  expectValid("let x = { a : 1 }; x is record", 1);
});

test('evaluate("type MyAlias = I32; let x : MyAlias = 100; x is MyAlias && x is I32") => 1', () => {
  expectValid(
    "type MyAlias = I32; let x : MyAlias = 100; x is MyAlias && x is I32",
    1,
  );
});

test('evaluate("type A = B; type B = A;") => Error', () => {
  expectInvalid("type A = B; type B = A;");
});

test('evaluate("args.length") => 1', () => {
  expectValid("args.length", 1, []);
});

test('evaluate("let x = if (args.length == 2) 100U8 else 100U16; x is U8") => 1', () => {
  expectValid("let x = if (args.length == 2) 100U8 else 100U16; x is U8", 1, [
    "foo",
  ]);
});

test('evaluate("let x = if (args.length == 2) 1U8 else 1U16; x is U8 | U16") => 1', () => {
  expectValid("let x = if (args.length == 2) 1U8 else 1U16; x is U8 | U16", 1, [
    "foo",
  ]);
});

test('evaluate("struct A {} struct B {} let x = if (args.length == 2) A {} else B {}; x is A") => 1', () => {
  expectValid(
    "struct A {} struct B {} let x = if (args.length == 2) A {} else B {}; x is A",
    1,
    ["foo"],
  );
});

test('evaluate("struct Wrapper<T> { field : T } let wrapper : Wrapper<Bool> = Wrapper<Bool> { field : true }; wrapper.field is Bool") => 1', () => {
  expectValid(
    "struct Wrapper<T> { field : T } let wrapper : Wrapper<Bool> = Wrapper<Bool> { field : true }; wrapper.field is Bool",
    1,
  );
});

test('compileToExports("out let x = 100;").x => 100', () => {
  expect(compileToExports("out let x = 100;").x).toBe(100);
});

test('compileToExports("out fn get() => 100;").get() => 100', () => {
  const { get } = compileToExports<{ get: () => number }>(
    "out fn get() => 100;",
  );
  expect(get()).toBe(100);
});
