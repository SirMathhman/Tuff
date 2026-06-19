import { test, expect } from "bun:test";
import { compileTuffToJS } from "../src/index.js";

function executeTuff(source, stdIn = "") {
  // Don't change this!
  const compiled = compileTuffToJS(source);
  return new Function("stdIn", compiled)(stdIn);
}

test('executeTuff("") => 0', () => {
  expect(executeTuff("")).toBe(0);
});

test("executeTuff(whitespace) => 0", () => {
  expect(executeTuff("   ")).toBe(0);
  expect(executeTuff("\t\n\r")).toBe(0);
  expect(executeTuff(" \n\t ")).toBe(0);
});

test('executeTuff("read()", "1") => 1', () => {
  expect(executeTuff("read()", "1")).toBe(1);
});

test('executeTuff("read()", "1 2") => 1', () => {
  expect(executeTuff("read()", "1 2")).toBe(1);
});

test('executeTuff("read() + read()", "1 2") => 3', () => {
  expect(executeTuff("read() + read()", "1 2")).toBe(3);
});

test('executeTuff("read() + read() + read()", "1 2 3") => 6', () => {
  expect(executeTuff("read() + read() + read()", "1 2 3")).toBe(6);
});

test('executeTuff("let x = read(); x", "1") => 1', () => {
  expect(executeTuff("let x = read(); x", "1")).toBe(1);
});

test('executeTuff("let mut x = read(); x = read(); x", "1 2") => 2', () => {
  expect(executeTuff("let mut x = read(); x = read(); x", "1 2")).toBe(2);
});

test('executeTuff("let mut x = read(); x += read(); x", "1 2") => 3', () => {
  expect(executeTuff("let mut x = read(); x += read(); x", "1 2")).toBe(3);
});

test('executeTuff("let mut total = 0; let count = read(); while (total < count) total += 1; total", "4") => 4', () => {
  expect(
    executeTuff(
      "let mut total = 0; let count = read(); while (total < count) total += 1; total",
      "4",
    ),
  ).toBe(4);
});

test('executeTuff("let count = read(); let mut sum = 0; for (i in 0..count) sum += i; sum", "4") => 6', () => {
  expect(
    executeTuff(
      "let count = read(); let mut sum = 0; for (i in 0..count) sum += i; sum",
      "4",
    ),
  ).toBe(6);
});

test('executeTuff("let array = [read()]; array[0]", "6") => 6', () => {
  expect(executeTuff("let array = [read()]; array[0]", "6")).toBe(6);
});

test('executeTuff("let mut array = [0]; array[0] = read(); array[0]", "6") => 6', () => {
  expect(
    executeTuff("let mut array = [0]; array[0] = read(); array[0]", "6"),
  ).toBe(6);
});

test('executeTuff("let x = read(); { let x = read(); } x", "1 2") => 1', () => {
  expect(executeTuff("let x = read(); { let x = read(); } x", "1 2")).toBe(1);
});

test('executeTuff("let x = readBool(); x", "true") => 1', () => {
  expect(executeTuff("let x = readBool(); x", "true")).toBe(1);
});

test('executeTuff("let mut x = 0; if (readBool()) x = 1; else x = 2; x", "true") => 1', () => {
  expect(
    executeTuff("let mut x = 0; if (readBool()) x = 1; else x = 2; x", "true"),
  ).toBe(1);
});

test("compileTuffToJS throws on unexpected character", () => {
  expect(() => compileTuffToJS("@foo")).toThrow();
});

test("compileTuffToJS throws on unclosed parenthesis", () => {
  expect(() => compileTuffToJS("read(")).toThrow();
});

test("compileTuffToJS throws on bare identifier", () => {
  expect(() => compileTuffToJS("foo")).toThrow();
});
