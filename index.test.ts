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
