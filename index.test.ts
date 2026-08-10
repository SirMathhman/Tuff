import { test, expect } from "bun:test";
import { compileTuffToJS } from ".";

function executeTuff(tuffSource: string, args: string[] = []): number {
  const generatedJS = compileTuffToJS("in let args; " + tuffSource);

  let exitCode = 0;
  const process = {
    exit(value: number) {
      exitCode = value;
    },
  };

  new Function("process", "args", generatedJS)(process, args);
  return exitCode;
}

test('executeTuff("") => 0', () => {
  expect(executeTuff("")).toBe(0);
});

test('executeTuff("1") => 1', () => {
  expect(executeTuff("1")).toBe(1);
});

test('executeTuff("1 + 2") => 3', () => {
  expect(executeTuff("1 + 2")).toBe(3);
});

test('executeTuff("1 + 2 + 3") => 6', () => {
  expect(executeTuff("1 + 2 + 3")).toBe(6);
});

test('executeTuff("2 + 3 - 4") => 1', () => {
  expect(executeTuff("2 + 3 - 4")).toBe(1);
});

test('executeTuff("2 * 3 + 4") => 10', () => {
  expect(executeTuff("2 * 3 + 4")).toBe(10);
});

test('executeTuff("2 + 3 * 4") => 14', () => {
  expect(executeTuff("2 + 3 * 4")).toBe(14);
});

test('executeTuff("(2 + 3) * 4") => 20', () => {
  expect(executeTuff("(2 + 3) * 4")).toBe(20);
});

test('executeTuff("{ 2 + 3 } * 4") => 20', () => {
  expect(executeTuff("{ 2 + 3 } * 4")).toBe(20);
});

test('compileTuff("( let x = 2 + 3; x ) * 4") => Error', () => {
  expect(() => compileTuffToJS("( let x = 2 + 3; x ) * 4")).toThrow();
});

test('executeTuff("let y = { let x = 2 + 3; x } * 4; y") => 20', () => {
  expect(executeTuff("let y = { let x = 2 + 3; x } * 4; y")).toBe(20);
});

test('executeTuff("let x = 100;") => 0', () => {
  expect(executeTuff("let x = 100;")).toBe(0);
});

test('compileTuff("let x = { let y = 100; y }; y") => Error', () => {
  expect(() => compileTuffToJS("let x = { let y = 100; y }; y")).toThrow();
});

test('executeTuff("let mut x = 0; x = 1; x") => 1', () => {
  expect(executeTuff("let mut x = 0; x = 1; x")).toBe(1);
});

test('compileTuff("let x = 0; x = 1; x") => Error', () => {
  expect(() => compileTuffToJS("let x = 0; x = 1; x")).toThrow();
});

test('executeTuff("let mut x = 0; { x = 1; } x") => 1', () => {
  expect(executeTuff("let mut x = 0; { x = 1; } x")).toBe(1);
});

test('executeTuff("let x = true; x") => 1', () => {
  expect(executeTuff("let x = true; x")).toBe(1);
});

test('executeTuff("let x = 1; let y = 2; x == y") => 0', () => {
  expect(executeTuff("let x = 1; let y = 2; x == y")).toBe(0);
});

test('executeTuff("true == 1") => 0', () => {
  expect(executeTuff("true == 1")).toBe(0);
});

test('compileTuff("let mut x = true; x = 1;") => Error', () => {
  expect(() => compileTuffToJS("let mut x = true; x = 1;")).toThrow();
});

test('executeTuff("let x = 0; let y = 1; x < y") => 1', () => {
  expect(executeTuff("let x = 0; let y = 1; x < y")).toBe(1);
});

test('executeTuff("let x = 0; let y = 1; (x < y) == 1") => 0', () => {
  expect(executeTuff("let x = 0; let y = 1; (x < y) == 1")).toBe(0);
});

test('executeTuff("100U8") => 100', () => {
  expect(executeTuff("100U8")).toBe(100);
});

test('compileTuff("256U8") => Error', () => {
  expect(() => compileTuffToJS("256U8")).toThrow();
});

test('executeTuff("let x = 100; -x") => -100', () => {
  expect(executeTuff("let x = 100; -x")).toBe(-100);
});

test('compileTuff("let x = 100U8; -x") => Error', () => {
  expect(() => compileTuffToJS("let x = 100U8; -x")).toThrow();
});

test('executeTuff("let x = if (true) 2 else 3; x") => 2', () => {
  expect(executeTuff("let x = if (true) 2 else 3; x")).toBe(2);
});

test('executeTuff("let x = if (false) 2 else if (false) 3 else 4; x") => 4', () => {
  expect(executeTuff("let x = if (false) 2 else if (false) 3 else 4; x")).toBe(4);
});

test('executeTuff("let mut x = 0; if (false) { x = 1; } else { x = 2; } x") => 2', () => {
  expect(executeTuff("let mut x = 0; if (false) { x = 1; } else { x = 2; } x")).toBe(2);
});

test('compileTuff("let x = { let y = 100; } x") => Error', () => {
  expect(() => compileTuffToJS("let x = { let y = 100; } x")).toThrow();
});

test('executeTuff("let mut x = 0; x += 1; x") => 1', () => {
  expect(executeTuff("let mut x = 0; x += 1; x")).toBe(1);
});

test('executeTuff("let mut x = 0; if (true) { x += 1; } x") => 1', () => {
  expect(executeTuff("let mut x = 0; if (true) { x += 1; } x")).toBe(1);
});

test('executeTuff("let mut x = 0; if (true) x += 1; x") => 1', () => {
  expect(executeTuff("let mut x = 0; if (true) x += 1; x")).toBe(1);
});

test('executeTuff("let mut x = 0; while (x < 4) { x += 1; } x") => 4', () => {
  expect(executeTuff("let mut x = 0; while (x < 4) { x += 1; } x")).toBe(4);
});

test('executeTuff("let mut x = 0; while (x < 4) x += 1; x") => 4', () => {
  expect(executeTuff("let mut x = 0; while (x < 4) x += 1; x")).toBe(4);
});

test('executeTuff("let mut x = 0; while (x < 4) { x += 1; break; } x") => 1', () => {
  expect(executeTuff("let mut x = 0; while (x < 4) { x += 1; break; } x")).toBe(1);
});

test('executeTuff("let mut x = 0; while (x < 4) { x += 1; continue; } x") => 4', () => {
  expect(executeTuff("let mut x = 0; while (x < 4) { x += 1; continue; } x")).toBe(4);
});

test('executeTuff("let mut sum = 0; for (i in 0..4) sum += i; sum") => 6', () => {
  expect(executeTuff("let mut sum = 0; for (i in 0..4) sum += i; sum")).toBe(6);
});

test('executeTuff("let mut sum = 0; let range = 0..4; for (i in range) sum += i; sum") => 6', () => {
  expect(executeTuff("let mut sum = 0; let range = 0..4; for (i in range) sum += i; sum")).toBe(6);
});

test('executeTuff("let x = match (2) { case 2 => 3; case _ => 4; }; x") => 3', () => {
  expect(executeTuff("let x = match (2) { case 2 => 3; case _ => 4; }; x")).toBe(3);
});

test('executeTuff("let x = match (1) { case 2 => 3; case _ => 4; }; x") => 4', () => {
  expect(executeTuff("let x = match (1) { case 2 => 3; case _ => 4; }; x")).toBe(4);
});

test('executeTuff("let array = [1, 2, 3]; array[0] + array[1] + array[2]") => 6', () => {
  expect(executeTuff("let array = [1, 2, 3]; array[0] + array[1] + array[2]")).toBe(6);
});

test('executeTuff("let mut array = [0]; array[0] = 1; array[0]") => 1', () => {
  expect(executeTuff("let mut array = [0]; array[0] = 1; array[0]")).toBe(1);
});

test('compileTuff("let mut x = 0; let y = { x = 100; };") => Error', () => {
  expect(() => compileTuffToJS("let mut x = 0; let y = { x = 100; };")).toThrow();
});
