import { describe, test, expect } from "bun:test";
import { interpret } from "../src/interpret";

describe("interpret", () => {
  test('interpret("100") should return 100', () => {
    const result = interpret("100");
    expect(result).toBe(100);
  });
  test('interpret("100U8") should return 100', () => {
    const result = interpret("100U8");
    expect(result).toBe(100);
  });
  test('interpret("-100U8") should throw error', () => {
    expect(() => interpret("-100U8")).toThrow();
  });
  test('interpret("-100I8") should return -100', () => {
    const result = interpret("-100I8");
    expect(result).toBe(-100);
  });
  test('interpret("256U8") should throw error', () => {
    expect(() => interpret("256U8")).toThrow();
  });
  test('interpret("1U8 + 2U8") should return 3', () => {
    const result = interpret("1U8 + 2U8");
    expect(result).toBe(3);
  });
  test('interpret("1 + 2") should return 3', () => {
    const result = interpret("1 + 2");
    expect(result).toBe(3);
  });
  test('interpret("1U8 + 255U8") should throw error', () => {
    expect(() => interpret("1U8 + 255U8")).toThrow();
  });
  test('interpret("1U8 + 255") should throw error', () => {
    expect(() => interpret("1U8 + 255")).toThrow();
  });
  test('interpret("1U8 + 255U16") should return 256', () => {
    const result = interpret("1U8 + 255U16");
    expect(result).toBe(256);
  });
  test('interpret("1U8 + 65535U16") should throw error', () => {
    expect(() => interpret("1U8 + 65535U16")).toThrow();
  });
  test('interpret("1U8 + 2U16 + 3U32") should return 6', () => {
    const result = interpret("1U8 + 2U16 + 3U32");
    expect(result).toBe(6);
  });
  test('interpret("2 + 3 - 4I8") should return 1', () => {
    const result = interpret("2 + 3 - 4I8");
    expect(result).toBe(1);
  });
  test('interpret("1 - 2U8") should throw error', () => {
    expect(() => interpret("1 - 2U8")).toThrow();
  });
  test('interpret("2 * 3U8 + 4") should return 10', () => {
    const result = interpret("2 * 3U8 + 4");
    expect(result).toBe(10);
  });
  test('interpret("4 + 2 * 3U8") should return 10', () => {
    const result = interpret("4 + 2 * 3U8");
    expect(result).toBe(10);
  });
  test('interpret("30U8 * 30U8") should throw error', () => {
    expect(() => interpret("30U8 * 30U8")).toThrow();
  });
  test('interpret("10 / 0") should throw error', () => {
    expect(() => interpret("10 / 0")).toThrow();
  });
  test('interpret("10 / (2 + 3)") should return 2', () => {
    const result = interpret("10 / (2 + 3)");
    expect(result).toBe(2);
  });
  test('interpret("10 / ({ 2 } + 3)") should return 2', () => {
    const result = interpret("10 / ({ 2 } + 3)");
    expect(result).toBe(2);
  });
  test('interpret("10 / ({ let x : U8 = 2; x } + 3)") should return 2', () => {
    const result = interpret("10 / ({ let x : U8 = 2; x } + 3)");
    expect(result).toBe(2);
  });
  test('interpret("let y : U8 = 10 / ({ let x : U8 = 2; x } + 3); y") should return 2', () => {
    const result = interpret(
      "let y : U8 = 10 / ({ let x : U8 = 2; x } + 3); y",
    );
    expect(result).toBe(2);
  });
  test('interpret("let x : U8 = 10 / ({ let x : U8 = 2; x } + 3); x") should throw error', () => {
    expect(() =>
      interpret("let x : U8 = 10 / ({ let x : U8 = 2; x } + 3); x"),
    ).toThrow();
  });
  test('interpret("let x : U16 = 10U8; x") should throw error', () => {
    expect(() => interpret("let x : U16 = 10U8; x")).toThrow();
  });
  test('interpret("let x = 10U8; x") should return 10', () => {
    const result = interpret("let x = 10U8; x");
    expect(result).toBe(10);
  });
  test('interpret("let x = 10U8; let y = x; y") should return 10', () => {
    const result = interpret("let x = 10U8; let y = x; y");
    expect(result).toBe(10);
  });
  test('interpret("let x = 10U8; let y : U16 = x; y") should throw error', () => {
    expect(() => interpret("let x = 10U8; let y : U16 = x; y")).toThrow();
  });
  test('interpret("let x = 100;") should return 0', () => {
    const result = interpret("let x = 100;");
    expect(result).toBe(0);
  });
  test('interpret("let mut x = 0; x = 100; x") should return 100', () => {
    const result = interpret("let mut x = 0; x = 100; x");
    expect(result).toBe(100);
  });
  test('interpret("let x = 0; x = 100; x") should throw error', () => {
    expect(() => interpret("let x = 0; x = 100; x")).toThrow();
  });
  test('interpret("let x : I32; x = 100; x") should return 100', () => {
    const result = interpret("let x : I32; x = 100; x");
    expect(result).toBe(100);
  });
  test('interpret("let x : U8; x = 100U16; x") should throw error', () => {
    expect(() => interpret("let x : U8; x = 100U16; x")).toThrow();
  });
  test('interpret("let x : I32; x = 100; x = 200; x") should throw error', () => {
    expect(() => interpret("let x : I32; x = 100; x = 200; x")).toThrow();
  });
  test('interpret("let mut x : I32; x = 100; x = 200; x") should return 200', () => {
    const result = interpret("let mut x : I32; x = 100; x = 200; x");
    expect(result).toBe(200);
  });
  test('interpret("let x : Bool = true; x") should return 1', () => {
    const result = interpret("let x : Bool = true; x");
    expect(result).toBe(1);
  });
  test('interpret("let x : Bool = true; let y = false; x && y") should return 0', () => {
    const result = interpret("let x : Bool = true; let y = false; x && y");
    expect(result).toBe(0);
  });
  test('interpret("let x : Bool = true; let y = false; x || y") should return 1', () => {
    const result = interpret("let x : Bool = true; let y = false; x || y");
    expect(result).toBe(1);
  });
  test('interpret("let x = 0; x && true") should throw error', () => {
    expect(() => interpret("let x = 0; x && true")).toThrow();
  });
  test('interpret("let x = 0; x + true") should throw error', () => {
    expect(() => interpret("let x = 0; x + true")).toThrow();
  });
  test('interpret("let x = 100; let y = 200; x < y") should return 1', () => {
    const result = interpret("let x = 100; let y = 200; x < y");
    expect(result).toBe(1);
  });
  test('interpret("let x = true; if (x) 3 else 5") should return 3', () => {
    const result = interpret("let x = true; if (x) 3 else 5");
    expect(result).toBe(3);
  });
  test('interpret("let x = 100; if (x) 3 else 5") should throw error', () => {
    expect(() => interpret("let x = 100; if (x) 3 else 5")).toThrow();
  });
  test('interpret("if (true) 3 else true") should throw error', () => {
    expect(() => interpret("if (true) 3 else true")).toThrow();
  });
  test('interpret("let test : Bool = if (true) 3 else 5; test") should throw error', () => {
    expect(() =>
      interpret("let test : Bool = if (true) 3 else 5; test"),
    ).toThrow();
  });
  test('interpret("let value = if (true) 3U8 else 5U8; value + 255U8") should throw error', () => {
    expect(() =>
      interpret("let value = if (true) 3U8 else 5U8; value + 255U8"),
    ).toThrow();
  });
  test('interpret("let mut x = 0; x += 10; x") should return 10', () => {
    const result = interpret("let mut x = 0; x += 10; x");
    expect(result).toBe(10);
  });
  test('interpret("let mut x = 100; x -= 30; x") should return 70', () => {
    const result = interpret("let mut x = 100; x -= 30; x");
    expect(result).toBe(70);
  });
  test('interpret("let mut x = 10; x *= 3; x") should return 30', () => {
    const result = interpret("let mut x = 10; x *= 3; x");
    expect(result).toBe(30);
  });
  test('interpret("let mut x = 30; x /= 3; x") should return 10', () => {
    const result = interpret("let mut x = 30; x /= 3; x");
    expect(result).toBe(10);
  });
  test('interpret("let x = 0; x += 10") should throw error', () => {
    expect(() => interpret("let x = 0; x += 10")).toThrow();
  });
  test('interpret("let x = 0; x += 10; x") should throw error', () => {
    expect(() => interpret("let x = 0; x += 10; x")).toThrow();
  });
  test('interpret("let mut x : U8; x += 10") should throw error', () => {
    expect(() => interpret("let mut x : U8; x += 10")).toThrow();
  });
  test('interpret("let mut x : U8 = 250; x += 10") should throw error', () => {
    expect(() => interpret("let mut x : U8 = 250; x += 10")).toThrow();
  });
  test('interpret("let mut x = true; x += 10; x") should throw error', () => {
    expect(() => interpret("let mut x = true; x += 10; x")).toThrow();
  });
  test('interpret("let mut x = 0; x += true; x") should throw error', () => {
    expect(() => interpret("let mut x = 0; x += true; x")).toThrow();
  });
  test('interpret("let y = 10 / (5 - 3); let mut x = 0; x += y; x") should return 5', () => {
    const result = interpret("let y = 10 / (5 - 3); let mut x = 0; x += y; x");
    expect(result).toBe(5);
  });
  test('interpret("let x = 100; let y : U16 = x; y") should throw error', () => {
    expect(() => interpret("let x = 100; let y : U16 = x; y")).toThrow();
  });
  test('interpret("let x = 100; let y : I32 = x; y") should return 100', () => {
    const result = interpret("let x = 100; let y : I32 = x; y");
    expect(result).toBe(100);
  });
  test('interpret("let x = 100; let y : *I32 = &x; *y") should return 100', () => {
    const result = interpret("let x = 100; let y : *I32 = &x; *y");
    expect(result).toBe(100);
  });
  test('interpret("let x = 100; let y = &x; let z = &y; **z") should return 100', () => {
    const result = interpret("let x = 100; let y = &x; let z = &y; **z");
    expect(result).toBe(100);
  });
  test('interpret("let x = 100; *x") should throw error', () => {
    expect(() => interpret("let x = 100; *x")).toThrow();
  });
  test('interpret("let mut x = 0; let y : *mut I32 = &mut x; *y = 100; x") should return 100', () => {
    const result = interpret(
      "let mut x = 0; let y : *mut I32 = &mut x; *y = 100; x",
    );
    expect(result).toBe(100);
  });
  test('interpret("let x = 0; let y : *mut I32 = &mut x; *y = 100; x") should throw error', () => {
    expect(() =>
      interpret("let x = 0; let y : *mut I32 = &mut x; *y = 100; x"),
    ).toThrow();
  });
  test('interpret("let mut x = 0; let y = &x; *y = 100; x") should throw error', () => {
    expect(() => interpret("let mut x = 0; let y = &x; *y = 100; x")).toThrow();
  });
  test('interpret("let x = { let y = 100; y }; x") should return 100', () => {
    const result = interpret("let x = { let y = 100; y }; x");
    expect(result).toBe(100);
  });
  test('interpret("let x = { let y = 100U16; y }; let z : U8 = x; z") should throw error', () => {
    expect(() =>
      interpret("let x = { let y = 100U16; y }; let z : U8 = x; z"),
    ).toThrow();
  });
  test('interpret("let x = 100; {} x") should return 100', () => {
    const result = interpret("let x = 100; {} x");
    expect(result).toBe(100);
  });
  test('interpret("let mut x = 0; { x = 100; } x") should return 100', () => {
    const result = interpret("let mut x = 0; { x = 100; } x");
    expect(result).toBe(100);
  });
  test('interpret("{ let mut x = 0; } x = 100; x") should throw error', () => {
    expect(() => interpret("{ let mut x = 0; } x = 100; x")).toThrow();
  });
  test('interpret("let x = 0; { let x = 1; } x") should throw error', () => {
    expect(() => interpret("let x = 0; { let x = 1; } x")).toThrow();
  });
  test('interpret("let mut x = 0; if (true) x = 3; else x = 5; x") should return 3', () => {
    const result = interpret("let mut x = 0; if (true) x = 3; else x = 5; x");
    expect(result).toBe(3);
  });

  test('interpret("let mut x = 0; if (true) { x = 3; } else { x = 5; } x") should return 3', () => {
    const result = interpret(
      "let mut x = 0; if (true) { x = 3; } else { x = 5; } x",
    );
    expect(result).toBe(3);
  });

  test('interpret("let mut x = 0; if (false) { x = 3; } else if (true) { x = 5; } else { x = 2; } x") should return 5', () => {
    const result = interpret(
      "let mut x = 0; if (false) { x = 3; } else if (true) { x = 5; } else { x = 2; } x",
    );
    expect(result).toBe(5);
  });

  test('interpret("let mut x = if (false) 3 else if (true) 5 else 2; x") should return 5', () => {
    const result = interpret(
      "let mut x = if (false) 3 else if (true) 5 else 2; x",
    );
    expect(result).toBe(5);
  });

  test('interpret("let mut x = 0; if (true) { x = 3; } x") should return 3', () => {
    const result = interpret("let mut x = 0; if (true) { x = 3; } x");
    expect(result).toBe(3);
  });

  test('interpret("let x = 10; let y = match (x) { case 10 => 2; case _ => 3; }; y") should return 2', () => {
    const result = interpret(
      "let x = 10; let y = match (x) { case 10 => 2; case _ => 3; }; y",
    );
    expect(result).toBe(2);
  });

  test('interpret("let x = 10; let y = match (x) { case 10 => 2; }; y") should throw error', () => {
    expect(() =>
      interpret("let x = 10; let y = match (x) { case 10 => 2; }; y"),
    ).toThrow();
  });

  test('interpret("let x = true; let y = match (x) { case true => 2; case false => 3; }; y") should return 2', () => {
    const result = interpret(
      "let x = true; let y = match (x) { case true => 2; case false => 3; }; y",
    );
    expect(result).toBe(2);
  });

  test('interpret("let x = true; let y : Bool = match (x) { case true => 2; case false => 3; }; y") should throw error', () => {
    expect(() =>
      interpret(
        "let x = true; let y : Bool = match (x) { case true => 2; case false => 3; }; y",
      ),
    ).toThrow();
  });

  test('interpret("let mut x = 0; while (x < 10) x += 1; x") should return 10', () => {
    const result = interpret("let mut x = 0; while (x < 10) x += 1; x");
    expect(result).toBe(10);
  });

  test('interpret("let mut x = 0; while (100) x += 1; x") should throw error', () => {
    expect(() => interpret("let mut x = 0; while (100) x += 1; x")).toThrow();
  });

  test('interpret("let mut sum = 0; for (let mut i in 0..10) sum += i; sum") should return 45', () => {
    const result = interpret(
      "let mut sum = 0; for (let mut i in 0..10) sum += i; sum",
    );
    expect(result).toBe(45);
  });

  test('interpret("let myTuple : (I32, Bool) = (100, true); myTuple[0]") should return 100', () => {
    const result = interpret(
      "let myTuple : (I32, Bool) = (100, true); myTuple[0]",
    );
    expect(result).toBe(100);
  });

  test('interpret("let myTuple : (I32, Bool) = (true, 100); myTuple[0]") should throw error', () => {
    expect(() =>
      interpret("let myTuple : (I32, Bool) = (true, 100); myTuple[0]"),
    ).toThrow();
  });

  test('interpret("let mut myTuple = (100, true); myTuple = (true, 100); myTuple[0]") should throw error', () => {
    expect(() =>
      interpret(
        "let mut myTuple = (100, true); myTuple = (true, 100); myTuple[0]",
      ),
    ).toThrow();
  });

  test('interpret("fn get() : I32 => 100; get()") should return 100', () => {
    const result = interpret("fn get() : I32 => 100; get()");
    expect(result).toBe(100);
  });
  test('interpret("fn get() : I32 => 100;") should return 0', () => {
    const result = interpret("fn get() : I32 => 100;");
    expect(result).toBe(0);
  });
  test('interpret("fn get() : I32 => 100; fn get() : I32 => 100;") should throw error', () => {
    expect(() =>
      interpret("fn get() : I32 => 100; fn get() : I32 => 100;"),
    ).toThrow();
  });
  test('interpret("fn get() : I32 => 100; let temp : Bool = get()") should throw error', () => {
    expect(() =>
      interpret("fn get() : I32 => 100; let temp : Bool = get()"),
    ).toThrow();
  });
  test('interpret("let func : () => I32 = fn get() : I32 => 100; func()") should return 100', () => {
    const result = interpret(
      "let func : () => I32 = fn get() : I32 => 100; func()",
    );
    expect(result).toBe(100);
  });
  test('interpret("let func = fn get() : I32 => 100; func()") should return 100', () => {
    const result = interpret("let func = fn get() : I32 => 100; func()");
    expect(result).toBe(100);
  });
  test('interpret("let func = () : I32 => 100; func()") should return 100', () => {
    const result = interpret("let func = () : I32 => 100; func()");
    expect(result).toBe(100);
  });
  test('interpret("let func = () => 100; func()") should return 100', () => {
    const result = interpret("let func = () => 100; func()");
    expect(result).toBe(100);
  });
  test('interpret("let func = () => 100; let temp : Bool = func();") should throw error', () => {
    expect(() =>
      interpret("let func = () => 100; let temp : Bool = func();"),
    ).toThrow();
  });
  test('interpret("let something = 100; something()") should throw error', () => {
    expect(() => interpret("let something = 100; something()")).toThrow();
  });
  test('interpret("fn get() => (100, 200); let result = get(); result[0] + result[1]") should return 300', () => {
    const result = interpret(
      "fn get() => (100, 200); let result = get(); result[0] + result[1]",
    );
    expect(result).toBe(300);
  });
  test('interpret("let x = 100; fn get() => x; get()") should return 100', () => {
    const result = interpret("let x = 100; fn get() => x; get()");
    expect(result).toBe(100);
  });
  test('interpret("let mut x = 0; fn add() : Void => x += 1; add(); x") should return 1', () => {
    const result = interpret(
      "let mut x = 0; fn add() : Void => x += 1; add(); x",
    );
    expect(result).toBe(1);
  });
  test('interpret("let generator : () => (Bool, I32) = 0..3; let result0 = generator(); let result1 = generator(); let result2 = generator(); result0[1] + result1[1] + result2[1]") should return 3', () => {
    const result = interpret(
      "let generator : () => (Bool, I32) = 0..3; let result0 = generator(); let result1 = generator(); let result2 = generator(); result0[1] + result1[1] + result2[1]",
    );
    expect(result).toBe(3);
  });
  test('interpret("let x = false; !x") should return 1', () => {
    const result = interpret("let x = false; !x");
    expect(result).toBe(1);
  });
  test('interpret("let generator : () => (Bool, I32) = 0..3; let result0 = generator(); let result1 = generator(); let result2 = generator(); result0[0] && result1[0] && !result2[0]") should return 1', () => {
    const result = interpret(
      "let generator : () => (Bool, I32) = 0..3; let result0 = generator(); let result1 = generator(); let result2 = generator(); result0[0] && result1[0] && !result2[0]",
    );
    expect(result).toBe(1);
  });
  test('interpret("let range : () => (Bool, I32) = 0..10; let mut sum = 0; for (let mut i in range) sum += i; sum") should return 45', () => {
    const result = interpret(
      "let range : () => (Bool, I32) = 0..10; let mut sum = 0; for (let mut i in range) sum += i; sum",
    );
    expect(result).toBe(45);
  });
  test('interpret("fn get() => { 100 }; get()") should return 100', () => {
    const result = interpret("fn get() => { 100 }; get()");
    expect(result).toBe(100);
  });
  test('interpret("let tuple : ((I32, I32), (I32, I32)) = ((1, 2), (3, 4)); tuple[0][0] + tuple[0][1] + tuple[1][0] + tuple[1][1]") should return 10', () => {
    const result = interpret(
      "let tuple : ((I32, I32), (I32, I32)) = ((1, 2), (3, 4)); tuple[0][0] + tuple[0][1] + tuple[1][0] + tuple[1][1]",
    );
    expect(result).toBe(10);
  });
  test('interpret("let x = 100; -x") should return -100', () => {
    const result = interpret("let x = 100; -x");
    expect(result).toBe(-100);
  });

  test('interpret("fn get() => {let x = 100; x}; get()") should return 100', () => {
    const result = interpret("fn get() => {let x = 100; x}; get()");
    expect(result).toBe(100);
  });

  test("interpret(user-defined generator in for-loop) should return -3", () => {
    const result = interpret(
      "let mut count = -1; let mut isPositive = false; fn myGenerator() : (Bool, I32) => { count += 1; isPositive = !isPositive; let value = if (isPositive) count else -count; if (count == 5) (false, value) else (true, value) } let mut sum = 0; for (let mut i in myGenerator) { sum += i; } sum",
    );
    expect(result).toBe(-3);
  });
  test('interpret("let get = 100; fn get() => 100;") should throw error', () => {
    expect(() => interpret("let get = 100; fn get() => 100;")).toThrow();
  });
  test('interpret("fn doNothing(x : I32, x : I32) => 100;") should throw error', () => {
    expect(() => interpret("fn doNothing(x : I32, x : I32) => 100;")).toThrow();
  });
});
