import { test, expect } from "bun:test";
import { compileTuffToJS } from ".";

const PRELUDE = "in let args : &[&Str]; ";

function executeTuff(tuffSource: string, args: string[] = []): number {
  const jsSource = compileTuffToJS(PRELUDE + tuffSource);
  try {
    return new Function("args", jsSource)(args);
  } catch (e) {
    throw new Error(
      "Failed to execute generated JS: '" + jsSource + "', Cause: " + e,
    );
  }
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

test('compile("#") => Error', () => {
  expect(() => compileTuffToJS("#")).toThrow();
});

test('executeTuff("2 + 3 - 4") => 1', () => {
  expect(executeTuff("2 + 3 - 4")).toBe(1);
});

test('executeTuff("2 * 3 - 4") => 2', () => {
  expect(executeTuff("2 * 3 - 4")).toBe(2);
});

test('executeTuff("2 + 3 * 4") => 14', () => {
  expect(executeTuff("2 + 3 * 4")).toBe(14);
});

test('executeTuff("10 / 3") => 3', () => {
  expect(executeTuff("10 / 3")).toBe(3);
});

test('executeTuff("(2 + 3) * 4") => 20', () => {
  expect(executeTuff("(2 + 3) * 4")).toBe(20);
});

test('executeTuff("{ 2 + 3 } * 4") => 20', () => {
  expect(executeTuff("{ 2 + 3 } * 4")).toBe(20);
});
